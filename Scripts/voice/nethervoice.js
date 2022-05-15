
const audioContext = new AudioContext();
const audioZone    = document.getElementById("audio-zone");


var localUser, currentRoom = [];
var zones = {};

var localConnections = {};
var localStream = null;

var audioOn  = true;
var microOn  = true;
var td_sound = false;

var AudioSourceNodes = {};

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
        if(td_sound) {
            AudioSourceNodes[userId].Audio.disconnect();
        } else {
            var userAudio = document.getElementById("audio-input::" + userId);
            if(userAudio != null) {
                userAudio.srcObject = null;
                userAudio.remove();
            }
        }
    }
}

const handleDisconnect = (userId, roomId) => {
    console.log("Disconnect Started");
    zones[roomId] = zones[roomId]?.filter(user => user != userId);

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
        if(localStream == null) {
            localStream = await navigator.mediaDevices
            .getUserMedia({ 
                audio: 
                    {   echoCancellation: true  ,
                        noiseSuppression: true  , 
                        autoGainControl : true }, 
                video: false
            });
            
            AudioSourceNodes[user] =  {
                StereoNode   : null,
                GainNode     : null,
                Transform    : null,
                Stream       : localStream,
                Audio        : audioContext.createMediaStreamSource(localStream)
            }
        }
        if(!td_sound) {
            var localAudio = document.createElement("AUDIO");
            localAudio.srcObject = localStream;
            localAudio.id = "local-audio";
        }
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
                    toggleMuteUser(user, !audioOn);
                }
            }
        );
    }
    console.log("Zone Change Finished");
}

const createHandshake = (userId) => {
    console.log("Create Handshake Started");
    var connection = new RTCPeerConnection(configuration);
    
    connection.onconnectionstatechange = (event) => {
        if(connection.connectionState == "failed") {
            connection.close();
            localConnections[userId] = createHandshake(userId);
            proposeOffer(userId);
        }
        
    }

    connection.ontrack = (event) => {
        console.log("Create Handshake Track");
        if(td_sound) {
            var remoteAudio = document.createElement("AUDIO");
            remoteAudio.srcObject = event.streams[0];

            const remoteNode = audioContext.createMediaStreamSource(remoteAudio.srcObject);
            const stereoNode = audioContext.createStereoPanner();
            const gainNode   = audioContext.createGain();

            AudioSourceNodes[userId] =  {
                StereoNode   : stereoNode,
                GainNode     : gainNode,
                Audio        : remoteNode,
                Stream       : event.streams[0],
                Transform    : null,
                DOMElement   : remoteAudio
            }

            remoteNode.connect(stereoNode);
            stereoNode.connect(gainNode);
            gainNode.connect(audioContext.destination);
            gainNode.gain.value = 0;
            audioContext.resume();
        } else {
            var remoteAudio = document.createElement("AUDIO");
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.id = "audio-input::" + userId;
            audioZone.appendChild(remoteAudio);
            remoteAudio.play();
            remoteAudio.muted = !audioOn;
        }
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

const toggleMuteUser = (id, state) => {
    if(td_sound) {
        AudioSourceNodes[id].GainNode.gain.value = state ? 0 : 1;
    } else {
        const audioElement = document.getElementById("audio-input::" + id);
        if(audioElement != null) {
            audioElement.muted = state;
        }
    }
}

function toggleSpeaker(isOn, persist = true) {
    if(persist) audioOn = isOn;
    if(isOn) {
        handleZoneChange(localUser);
    } else {
        if(td_sound) {
            for(var key in AudioSourceNodes) {
                AudioSourceNodes[key].GainNode.gain.value = audioOn ? 1 : 0;
            }
        } else {
            var audioNodes = document.getElementsByTagName("AUDIO");
            for(var i = 0; i < audioNodes.length; i++) {
                audioNodes[i].muted = true;
            }
        }
    }
}

function UpdatePlayerPosition(userId, _position, _direction) {
    if(!td_sound || localUser == null || AudioSourceNodes[userId] == null) return;

    const getAudioConstraints = (remoteTransform) => {
        try {
            let localTransform = AudioSourceNodes[localUser].Transform;
            let xs = localTransform.position.x - remoteTransform.position.x,
                ys = localTransform.position.y - remoteTransform.position.y,
                zs = localTransform.position.z - remoteTransform.position.z;
            let distance = Math.sqrt(xs * xs + ys * ys + zs * zs );
            let volume = distance > 20 ? 0.0 : (Math.atan(5-distance/2) + Math.PI/2) / Math.PI; 
    
            // Note(Ayman) : use proper math, and make it work
            let otherAngle = xs != 0 ? Math.atan2(Math.abs(ys), Math.abs(xs)) 
                                     : Math.PI * 0.5;
            let relativeAngle = localTransform.angle - otherAngle ;
            return {
                "volume"   : volume * (audioOn ? 1 : 0), 
                "relative" : Math.max(-1,Math.min(1,relativeAngle * 2 / Math.PI))
            };
        } catch(e) {
            return {
                "volume"   : 0,
                "relative" : 0
            };
        }
    }

    const applyAudioConstraints = (id, constraints) => {
        if(AudioSourceNodes[id] == null) return;
        AudioSourceNodes[id].StereoNode.pan.value = constraints.relative;
        AudioSourceNodes[id].GainNode.gain.value = constraints.volume;
    }

    AudioSourceNodes[userId].Transform = {
        "position" : _position,
        "angle"    : _direction
    }

    if(userId == localUser) {
        let zone = zones[currentRoom[currentRoom.length - 1]];
        zone?.forEach(user => {
            if(user != localUser && AudioSourceNodes[user] != null) {
                applyAudioConstraints(user, getAudioConstraints(AudioSourceNodes[user]?.Transform));
            }
        });
    } else if(AudioSourceNodes[userId] != null) {
        applyAudioConstraints(userId, getAudioConstraints(AudioSourceNodes[userId]?.Transform));
    } 
}