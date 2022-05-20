const audioContext = new AudioContext();
const audioZone    = document.getElementById("audio-zone");

var LocalState;
const initiateState = () => 
    LocalState = {
        UserId      : null, 
        CurrentRoom : [],
        Connections : {},
        AudioNodes  : {
            Local : null,
            Remote: {}
        },
        Zones       : {},
        SoundSetting: {
            Microphone   : 1,
            Speakers     : 1,
            IsPositional : 1
        }, 
        LocalStream : null 
    };
initiateState();


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
    Error      : 10
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
        case actions.Error      :
            handleError(data.Body);
        default:
            break;
    }
};

const send = (target, message) => {
    message.TargetIds = [target];    
    WebglInstance.SendMessage("GameManager", "HandleMessageBrowser", JSON.stringify(message));
}

const handleQuit = (userId, roomId) => {
    LocalState.Zones[roomId] = LocalState.Zones[roomId].filter(user => user != userId);

    if(userId == LocalState.UserId) {
        var roomId = LocalState.CurrentRoom[LocalState.CurrentRoom.length - 1];
        if(roomId != null && LocalState.Zones[roomId] != null) {
            LocalState.Zones[roomId] = LocalState.Zones[roomId].filter(user => 
                handleDisconnect(user, roomId)
            );
        }
        initiateState();
    } else {
        if(LocalState.Connections[userId] != null) {
            LocalState.Connections[userId].close();
            // delete LocalState.Connections[userId];
        }

        LocalState.AudioNodes.Remote[userId].Audio.disconnect();
        LocalState.AudioNodes.Remote[userId].Analyser.disconnect();
        //delete LocalState.AudioNodes.Remote[userId];
    }
}

const handleDisconnect = (userId, roomId) => {
    console.log("Disconnect Started");
    LocalState.Zones[roomId] = LocalState.Zones[roomId]?.filter(user => user != userId);

    if(userId == LocalState.UserId) {
        LocalState.CurrentRoom.shift();
    } 

    handleZoneChange(userId);
    console.log("Disconnect Finished");
}

const handleInitiate  = async (user) => {
    console.log("Initiate Started");
    LocalState.UserId = user;
    try {
        if(LocalState.LocalStream == null) {
            LocalState.LocalStream = await navigator.mediaDevices
            .getUserMedia({ 
                audio: 
                    {   echoCancellation: true  ,
                        noiseSuppression: true  , 
                        autoGainControl : true }, 
                video: false
            });
            
            LocalState.AudioNodes.Local =  {
                Stream       : LocalState.LocalStream,
                Audio        : audioContext.createMediaStreamSource(LocalState.LocalStream)
            }
        }
        console.log("Initiate Finished");
    } catch (error) {
        LocalState.LocalStream = null;
    }
}

const handleHandshake = async (userId, roomId) => {
    console.log("Handshake Started");
    if(userId == LocalState.UserId) {
        LocalState.CurrentRoom.push(roomId); 
    }
    
    if(LocalState.Zones[roomId] == null) {
        LocalState.Zones[roomId] = [];
    }

    LocalState.Zones[roomId].push(userId);

    handleZoneChange(userId);
    console.log("Handshake Finished");
}

const handleZoneChange = (userId) => {
    toggleSpeaker(false, false);
    if(LocalState.CurrentRoom.length > 0) {
        var roomId = LocalState.CurrentRoom[LocalState.CurrentRoom.length - 1];
        var userIds = LocalState.Zones[roomId];
        userIds.forEach(user => {
                if(userId == LocalState.UserId && !LocalState.Connections[user] && user != LocalState.UserId) {
                            LocalState.Connections[user] = createHandshake(user);
                            proposeOffer(user);
                } else {
                    setUserSoundState(user, LocalState.SoundSetting.Speakers);
                }
            }
        );
    }
    console.log("Zone Change Finished");
}

const createHandshake = (userId) => {
    console.log("Create Handshake Started");
    var connection = new RTCPeerConnection(configuration);
    
    connection.onconnectionstatechange = (_) => {
        if(connection.connectionState == "failed") {
            connection.close();
            LocalState.AudioNodes.Remote[userId].Audio.disconnect();
            LocalState.Connections[userId] = createHandshake(userId);
            proposeOffer(userId);
        }
    }

    connection.ontrack = (event) => {
        console.log("Create Handshake Track");
        var remoteAudio = document.createElement("AUDIO");
        remoteAudio.srcObject = event.streams[0];

        const remoteNode   = audioContext.createMediaStreamSource(remoteAudio.srcObject);
        const stereoNode   = audioContext.createStereoPanner();
        const gainNode     = audioContext.createGain();
        const AnalyserNode = audioContext.createAnalyser();

        LocalState.AudioNodes.Remote[userId] =  {
            Stereo       : stereoNode,
            Gain         : gainNode,
            Audio        : remoteNode,
            Stream       : event.streams[0],
            Analyser     : AnalyserNode,
            Transform    : null,
            SoundState   : 1,
            DOMElement   : remoteAudio
        }

        remoteNode.connect(stereoNode);
        stereoNode.connect(gainNode);
        gainNode.connect(AnalyserNode);
        AnalyserNode.connect(audioContext.destination);
        gainNode.gain.value = 0;
        audioContext.resume();
    };

    if(LocalState.LocalStream != null) {
        LocalState.LocalStream.getTracks().forEach(track => connection.addTrack(track, LocalState.LocalStream));
    }
    console.log("Create Handshake Finished");
    return connection;
}

const proposeOffer = async (targetId) => {
    console.log("Propose Offer Started");
    var offer = await LocalState.Connections[targetId].createOffer();
    await LocalState.Connections[targetId].setLocalDescription(offer);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    send(targetId, {  Source   : handlers.Browser, 
                      Action   : actions.Offer,
                      Body     : JSON.stringify(LocalState.Connections[targetId].localDescription),
                      SenderId : LocalState.UserId });
    console.log("Propose Offer Finished");
}

const handleOffer = async (target, offer) => {
    console.log("Handle Offer Started");
    LocalState.Connections[target] = createHandshake(target);
    await LocalState.Connections[target].setRemoteDescription(offer);
    const answer = await LocalState.Connections[target].createAnswer()
    await LocalState.Connections[target].setLocalDescription(answer);

    await new Promise(resolve => setTimeout(resolve, 1000));

    send(target, {  Source   : handlers.Browser,
                    Action   : actions.Answer,
                    Body     : JSON.stringify(LocalState.Connections[target].localDescription), 
                    SenderId : LocalState.UserId});
    console.log("Handle Offer Finished");
}

const handleAnswer = async (sender, answer) => {
    console.log("Handle Answer Started");
    await LocalState.Connections[sender].setRemoteDescription(answer);
    console.log("Handle Answer Finished");
}

function toggleMicrophone(isOn) {
    LocalState.SoundSetting.Microphone = isOn;
    if(LocalState.LocalStream != null) {
        LocalState.LocalStream.getAudioTracks().forEach(track => {
            track.enabled = LocalState.SoundSetting.Microphone > 0 ? true : false;  
        });
    }
}

const setUserSoundState = (id, state) => {
    if(LocalState.AudioNodes.Remote[id]) {
        LocalState.AudioNodes.Remote[id].SoundState       = state;
        LocalState.AudioNodes.Remote[id].Gain.gain.value *= state;
    }
}

function toggleSpeaker(isOn, persist = true) {
    if(persist) LocalState.SoundSetting.Speakers = isOn;
    if(isOn) {
        handleZoneChange(LocalState.UserId);
    } else {
        for(var key in LocalState.AudioNodes.Remote) {
            setUserSoundState(key, 0);
        }
    }
}

function handleError(err) {
    alert(err); console.log(err);
}


function UpdatePlayerPosition(userId, _position, _direction) {
    if(!LocalState.SoundSetting.IsPositional) return;

    const getAudioConstraints = (remoteUser) => {
        try {
            let localNode  = LocalState.AudioNodes.Local;
            let remoteNode = LocalState.AudioNodes.Remote[remoteUser];
            let xs = localNode.Transform.position.x - remoteNode.Transform.position.x,
                ys = localNode.Transform.position.y - remoteNode.Transform.position.y,
                zs = localNode.Transform.position.z - remoteNode.Transform.position.z;
            let distance = Math.sqrt(xs * xs + ys * ys + zs * zs );
            let volume = distance > 20 ? 0.0 : Math.atan(5-distance) * 0.33 + 0.55; 
            
            // Note(Ayman) : use proper math, and make it work
            let otherAngle = xs != 0 ? Math.atan2(Math.abs(ys), Math.abs(xs)) : Math.PI * 0.5;
            let relativeAngle = localNode.Transform.angle - otherAngle ;
            return {
                "volume"   : volume * remoteNode.SoundState, 
                "relative" : Math.max(-1,Math.min(1,relativeAngle * 2 / Math.PI))
            };
        } catch (error) {
            return {
                "volume"   : 0, 
                "relative" : 0
            };
        }
    }

    const applyAudioConstraints = (id, constraints) => {
        console.log(constraints);
        LocalState.AudioNodes.Remote[id].Stereo.pan.value = constraints.relative;
        LocalState.AudioNodes.Remote[id].Gain.gain.value  = constraints.volume;
    }
    try {
        if(userId == LocalState.UserId) {
            LocalState.AudioNodes.Local.Transform = {
                "position" : _position,
                "angle"    : _direction
            }
        } else {
            LocalState.AudioNodes.Remote[userId].Transform = {
                "position" : _position,
                "angle"    : _direction
            }
        }

        if(userId == LocalState.UserId) {
            let zone = LocalState.Zones[LocalState.CurrentRoom[LocalState.CurrentRoom.length - 1]];
            zone?.forEach(user => {
                if(user != LocalState.UserId && LocalState.AudioNodes.Remote[user] != null) {
                    applyAudioConstraints(user, getAudioConstraints(user));
                }
            });
        } else if(LocalState.AudioNodes.Remote[userId] != null) {
            applyAudioConstraints(userId, getAudioConstraints(userId));
        } 
    } catch(e) {}
}

function CheckSpeakers() {
    var average = arr => arr.reduce((a, v) => a + v, 0) / arr.length;
    if(LocalState.CurrentRoom.length > 0) {
        var roomId = LocalState.CurrentRoom[LocalState.CurrentRoom.length - 1];
        var userIds = LocalState.Zones[roomId];
        userIds.forEach(id => {
            if(id == LocalState.UserId) {
                return;
            }
            var analyser = LocalState.AudioNodes.Remote[id].Analyser
            var bufferLength = analyser.fftSize;
            var dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);
            let volume = average(dataArray);
            let isSpeaking = volume >= 7 &&  LocalState.AudioNodes.Remote[id].Gain.gain.value * LocalState.AudioNodes.Remote[id].SoundState > 0;
            if(isSpeaking) {
                WebglInstance.SendMessage("GameManager", "HighLightPlayer", `${id}:1`);
            } else {
                WebglInstance.SendMessage("GameManager", "HighLightPlayer", `${id}:0`);
            }
        });
    }
}

setInterval(CheckSpeakers, 100);
