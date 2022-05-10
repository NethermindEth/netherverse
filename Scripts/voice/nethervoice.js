const EFFICIENT_MODE = false;
var localUser, transform;
var availableUsers = [];

var localConnections = {};
var localStream = null;

var audioOn = true;
var microOn = true;

var audioZone = document.getElementById("audio-zone");

var configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:0.peerjs.com:3478", username: "peerjs", credential: "peerjsp" }
    ],
    sdpSemantics: "unified-plan"
};

var actions = {   
    Initiate   : 0,       Offer      : 3,      
    Handshake  : 5,       Disconnect : 6,
    Answer     : 4,       Quit       : 9,
    
}

var handlers = {
    Browser    : 1,     Unity     : 2,      
    Server     : 4,     None      : 0,
}


function handleMessage(message) {
    receiveMessage(message);
}

const receiveMessage = async (message) => {
    var data = JSON.parse(message);
    switch (data.Action) {
        case actions.Initiate   :
            await handleInitiate(data.SenderId);
            break;
        case actions.Handshake  :
            handleHandshake(data.SenderId, data.TargetIds);
            break;
        case actions.Offer      :
            await handleOffer(data.SenderId, JSON.parse(data.Body));
            break;
        case actions.Answer     :
            await handleAnswer(data.SenderId, JSON.parse(data.Body));
            break;
        case actions.Disconnect :
            handleDisconnect(data.SenderId);
            break;
        case actions.Quit       :
            handleQuit(data.SenderId);
            break;
        default:
            break;
    }
};

const send = (target, message) => {
    message.TargetIds = [target];    
    WebglInstance.SendMessage("GameManager", "HandleMessageBrowser", JSON.stringify(message));
}

const handleQuit = (userId) => {
    if(userId == localUser) {
        for(var i = 0; i < availableUsers.length; i++) {
            if(availableUsers[i] != localUser) {
                handleDisconnect(availableUsers[i], null);
            }
        }
    } else {
        availableUsers = availableUsers.filter(user => user != userId)
        if(localConnections[userId] != null) {
            localConnections[userId].close();
            delete localConnections[userId];
        }
    
        var userAudio = document.getElementById("audio-input::" + userId);
        if(userAudio != null) {
            userAudio.srcObject = null;
            userAudio.remove();
        }
    }
}

const handleDisconnect = (userId) => {
    if(userId == localUser) {
        for(var i = 0; i < availableUsers.length; i++) {
            if(availableUsers[i] != localUser) {
                handleDisconnect(availableUsers[i], null);
            }
        }
    } else {
        availableUsers = availableUsers.filter(user => user != userId)
        if(localConnections[userId] != null) {
            if(EFFICIENT_MODE) {
                localConnections[userId].replaceTrack(null, localStream);
            } else {
                toggleMuteUser(userId, true);
            }
        }
    }

}

const handleInitiate  = async (user) => {
    console.log("Initiate Started");
    localUser = user;
    try {
        localStream = await navigator.mediaDevices
                                     .getUserMedia({ 
                                        audio: 
                                            { echoCancellation: true  ,
                                              noiseSuppression: true  , 
                                              autoGainControl : true }, 
                                        video: false
                                    });
        var localAudio = document.createElement("AUDIO");
        localAudio.srcObject = localStream;
        localAudio.id = "local-audio";
        console.log("Initiate Finished");
    } catch (error) {
        localStream = null;
    }
}

const handleHandshake = async (userId, userIds) => {
    console.log("Handshake Started");
    if(userId == localUser) {
        availableUsers = userIds;
        availableUsers.forEach(user => {
            if(localUser != user) {
                if(localConnections[user] == null) {
                    localConnections[user] = createHandshake(user);
                    proposeOffer(user);
                } else {
                    if(EFFICIENT_MODE) {
                        localConnections[user].replaceTrack(localStream.getTracks()[0], localStream);
                    } else {
                        toggleMuteUser(user, !audioOn);
                    }
                }
            }
        });
    } else if(userIds.includes(localUser) && localConnections[userId] != null) {
        toggleMuteUser(userId, !audioOn);
    }
    console.log("Handshake Finished");
}

const createHandshake = (userId) => {
    console.log("Create Handshake Started");
    var connection = new RTCPeerConnection(configuration);

    connection.ontrack = (event) => {
        // create audio element 
        var remoteAudio = document.createElement("AUDIO");
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.id = "audio-input::" + userId;
        audioZone.appendChild(remoteAudio);
        remoteAudio.play();
        remoteAudio.muted = !audioOn;
    };

    if(localStream != null) {
        localStream.getTracks().forEach(track => connection.addTrack(track, localStream));
    }
    console.log("Create Handshake Finished");
    return connection;
}

const proposeOffer = async (targetId) => {
    console.log("Propose Offer Started");
    var offer = await localConnections[targetId].createOffer();
    await localConnections[targetId].setLocalDescription(offer);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    send(targetId, {  Source   : handlers.Browser, 
                      Action   : actions.Offer,
                      Body     : JSON.stringify(localConnections[targetId].localDescription),
                      SenderId : localUser });
    console.log("Propose Offer Finished");
}

const handleOffer = async (target, offer) => {
    console.log("Handle Offer Started");
    if(!availableUsers.includes(target)) {
        availableUsers.push(target);
    }
    localConnections[target] = createHandshake(target);
    await localConnections[target].setRemoteDescription(offer);
    const answer = await localConnections[target].createAnswer()
    await localConnections[target].setLocalDescription(answer);

    await new Promise(resolve => setTimeout(resolve, 1000));

    send(target, {  Source   : handlers.Browser,
                    Action   : actions.Answer,
                    Body     : JSON.stringify(localConnections[target].localDescription), 
                    SenderId : localUser});
    console.log("Handle Offer Finished");
}

const handleAnswer = async (sender, answer) => {
    console.log("Handle Answer Started");
    await localConnections[sender].setRemoteDescription(answer);
    console.log("Handle Answer Finished");
}

function toggleMicrophone(isOn) {
    microOn = isOn;
    if(localStream != null) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = microOn;  
        });
    }
}

function toggleMuteUser(id, state) {
    const audioElement = document.getElementById("audio-input::" + id);
    audioElement.muted = state;
}

function toggleSpeaker(isOn) {
    audioOn = isOn;
    availableUsers.forEach(userId => {
        toggleMuteUser(userId, !audioOn);
    });
}

function UpdatePlayerPosition(id, _position, _direction) {
    if(localUser == null ) return;
    const getAudioConstraints = (remotePos) => {
        let xs = transform.position.x - remotePos.x;
        let ys = transform.position.y - remotePos.y;
        let zs = transform.position.z - remotePos.z;
        var distance = Math.sqrt(xs * xs + ys * ts + zs * zs );
        var volume = Math.max(0, (1-Math.exp(distance - 10)));
        var otherAngle = xs != 0 ? Math.atan(ys/xs) 
                                 : Math.PI * 0.5;
        var relativePosition = transform.angle - otherAngle ;
        return {
            "volume"   : volume, 
            "relative" : relativePosition / Math.Pi
        };
    }

    if(id == localUser) {
        transform = {
            "position" : _position,
            "angle"    : _direction 
        } 
        return;
    }

    var constraints = getAudioConstraints(transform.position, _position);

    const audioContext = new AudioContext();
    const audioElement = document.getElementById("audio-input::" + id);
    const track = audioContext.createMediaElementSource(audioElement);

    const stereoNode = new StereoPannerNode(audioContext, { pan: 0 });
    stereoNode.pan.value = constraints.relative; 
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = constraints.volume;
    
    track.connect(stereoNode)
        .connect(gainNode)
        .connect(audioContext.destination);
}
