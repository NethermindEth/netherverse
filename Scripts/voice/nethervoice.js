const EFFICIENT_MODE = false;
const TD_SOUNDS_MODE = false;

const audioContext = new AudioContext();
const audioZone = document.getElementById("audio-zone");

var localUser, currentRoom = [], transform;
var zones = {};

var localConnections = {};
var localStream = null;

var audioOn = true;
var microOn = true;

var MediaElementAudioSourceNodeMap = {};

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
            handleHandshake(data.SenderId, data.RoomId);
            break;
        case actions.Offer      :
            await handleOffer(data.SenderId, JSON.parse(data.Body));
            break;
        case actions.Answer     :
            await handleAnswer(data.SenderId, JSON.parse(data.Body));
            break;
        case actions.Disconnect :
            handleDisconnect(data.SenderId, data.RoomId);
            break;
        case actions.Quit       :
            handleQuit(data.SenderId, data.RoomId);
            break;
        default:
            break;
    }
};

const send = (target, message) => {
    message.TargetIds = [target];    
    WebglInstance.SendMessage("GameManager", "HandleMessageBrowser", JSON.stringify(message));
}

const handleQuit = (userId, roomId) => {
    zones[roomId] = zones[roomId].filter(user => user != userId);

    if(userId == localUser) {
        var roomId = currentRoom[currentRoom.length - 1];
        if(roomId != null && zones[roomId] != null) {
            zones[roomId] = zones[roomId].filter(user => 
                handleDisconnect(user, null)
            );
        }
        zones = {};
        currentRoom = [];
        transform = null;
        localUser = null;
        localConnections = {};
        localStream = null;
        audioOn = true;
        microOn = true;
    } else {
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

const handleDisconnect = (userId, roomId) => {
    console.log("Disconnect Started");
    zones[roomId]  = zones[roomId]?.filter(user => user != userId);

    if(userId == localUser) {
        currentRoom.shift();
    } 

    handleZoneChange(userId);
    console.log("Disconnect Finished");
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

const handleHandshake = async (userId, roomId) => {
    console.log("Handshake Started");
    if(userId == localUser) {
        currentRoom.push(roomId); 
    }
    
    if(zones[roomId] == null) {
        zones[roomId] = [];
    }

    zones[roomId].push(userId);

    handleZoneChange(userId);
    console.log("Handshake Finished");
}

const handleZoneChange = (userId) => {
    toggleSpeaker(false, false);
    if(currentRoom.length > 0) {
        var roomId = currentRoom[currentRoom.length - 1];
        var userIds = zones[roomId];
        userIds.forEach(user => {
                if(localConnections[user] == null) {
                    if(userId == localUser && user != localUser) {
                        localConnections[user] = createHandshake(user);
                        proposeOffer(user);
                    }
                } else {
                    if(EFFICIENT_MODE) {
                        localConnections[user].replaceTrack(localStream.getTracks()[0], localStream);
                    } else {
                        toggleMuteUser(user, !audioOn);
                    }
                }
            }
        );
    }
    console.log("Zone Change Finished");
}

const createHandshake = (userId) => {
    console.log("Create Handshake Started");
    var connection = new RTCPeerConnection(configuration);

    connection.ontrack = (event) => {
        var remoteAudio = document.createElement("AUDIO");
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.id = "audio-input::" + userId;
        audioZone.appendChild(remoteAudio);
        remoteAudio.play();
        remoteAudio.muted = !audioOn;
    };

    connection.oniceconnectionstatechange = (event) => {
        if(event.target.iceConnectionState == "disconnected" || event.target.iceConnectionState == "failed") {
            connection.close();
            localConnections[userId] = createHandshake(userId);
            proposeOffer(userId);
        }
        
    }

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
    if(audioElement != null) {
        audioElement.muted = state;
    }
}

function toggleSpeaker(isOn, persist = true) {
    if(persist) audioOn = isOn;
    if(isOn) {
        handleZoneChange(localUser);
    } else {
        var audioNodes = document.getElementsByTagName("AUDIO");
        for(var i = 0; i < audioNodes.length; i++) {
            audioNodes[i].muted = true;
        }
    }
}

function UpdatePlayerPosition(id, _position, _direction) {
    if(!TD_SOUNDS_MODE) return;

    if(localUser == null ) return;
    const getAudioConstraints = (remotePos) => {
        let xs = transform.position.x - remotePos.x;
        let ys = transform.position.y - remotePos.y;
        let zs = transform.position.z - remotePos.z;
        var distance = Math.sqrt(xs * xs + ys * ys + zs * zs );
        var volume = Math.max(0, (1-Math.exp(distance - 10)));
        console.log(distance, volume);
        var otherAngle = xs != 0 ? Math.atan(ys/xs) 
                                 : Math.PI * 0.5;
        console.log(otherAngle);
        var relativePosition = transform.angle - otherAngle ;
        console.log(relativePosition);
        return {
            "volume"   : volume, 
            "relative" : relativePosition == NaN ? 0 : Math.max(-1,Math.min(1,relativePosition / Math.PI))
        };
    }

    if(id == localUser) {
        transform = {
            "position" : _position,
            "angle"    : _direction 
        } 
        return;
    }

    if(transform == null || transform.position == null || transform.angle == null) {
        return;
    }

    var constraints = getAudioConstraints(_position);
    console.log(constraints);
    
    const audioElement = document.getElementById("audio-input::" + id);
    if(audioElement == null) return;
    
    if(MediaElementAudioSourceNodeMap[id] == null) {
        MediaElementAudioSourceNodeMap[id] = new MediaElementAudioSourceNode(audioElement);
    }
    track = MediaElementAudioSourceNodeMap[id];        
    const stereoNode = audioContext.createStereoPanner();
    stereoNode.pan.value = constraints.relative; 
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = constraints.volume;
    
    track.connect(gainNode)
        .connect(stereoNode)
        .connect(audioContext.destination);
}
