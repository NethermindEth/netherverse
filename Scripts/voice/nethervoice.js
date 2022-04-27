var localUser, currentRoom;
var availableUsers = [];

var localConnections = {}
var localStream;

var audioZone = document.getElementById("audio-zone");

var configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:0.peerjs.com:3478", username: "peerjs", credential: "peerjsp" }
    ],
    sdpSemantics: "unified-plan"
};

function handleMessage(message) {
    receiveMessage(message);
}

const receiveMessage = async (message) => {
    var data = JSON.parse(message);
    switch (data.Action) {
        case "Initiate":
            await handleInitiate(data.SenderId, data.Body == "true");
            break;
        case "Handshake" :
            handleHandshake(data.TargetIds, data.RoomId);
            break;
        case "Offer":
            await handleOffer(data.SenderId, JSON.parse(data.Body));
            break;
        case "Answer":
            await handleAnswer(data.SenderId, JSON.parse(data.Body));
            break;
        case "Disconnect" :
            handleDisconnect(data.SenderId);
            break;
        case "Raw" :
            // Note (Ayman) :: send byte[] via datachannels 
            break;
        default:
            break;
    }
};

const send = (target, message) => {
    message.TargetIds = [target];    
    WebglInstance.SendMessage("GameManager", "ReceiveMessage", JSON.stringify(message));
}

const handleDisconnect = (userId) => {
    availableUsers = availableUsers.filter(user => user != userId)
    localConnections[userId].close();
    delete localConnections[userId];

    var userAudio = document.getElementById("audio-input :: " + userId);
    userAudio.srcObject = null;
    userAudio.remove();

}

const handleInitiate  = async (user, success) => {
    if (!success) {
        alert("Login failed");
        return;
    }
    console.log("Initiate Started");
    localUser = user;
    localStream = await navigator.mediaDevices
                                 .getUserMedia({ 
                                    audio: true, 
                                    video: false,
                                    audioConstraints: 
                                       {echoCancellation: true,
                                        noiseSuppression: true,
                                        autoGainControl : true }
                                    });
    var localAudio = document.createElement("AUDIO");
    localAudio.srcObject = localStream;
    localAudio.id = "local-audio";
    console.log("Initiate Finished");
}

const handleHandshake = async (users, room) => {
    console.log("Handshake Started");
    currentRoom = room;
    availableUsers = users;
    users.forEach(user => {
        var exists = localUser == user;
        if(!exists) {
            localConnections[user] = createHandshake(user);
            proposeOffer(user);
        }
    });
    console.log("Handshake Finished");
}

const createHandshake = (userId) => {
    console.log("Create Handshake Started");
    var connection = new RTCPeerConnection(configuration);

    connection.ontrack = (event) => {
        // create audio element 
        var remoteAudio = document.createElement("AUDIO");
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.id = "audio-input :: " + userId;
        audioZone.appendChild(remoteAudio);
        remoteAudio.play();
    };

    localStream.getTracks().forEach(track => connection.addTrack(track, localStream));
    console.log("Create Handshake Finished");
    return connection;
}

const proposeOffer = async (targetId) => {
    console.log("Propose Offer Started");
    var offer = await localConnections[targetId].createOffer();
    await localConnections[targetId].setLocalDescription(offer);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    send(targetId,{ Source   : "Browser", 
                    Action   : "Offer",
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

    send(target, {  Source   : "Browser",
                    Action   : "Answer",
                    Body     : JSON.stringify(localConnections[target].localDescription), 
                    SenderId : localUser});
    console.log("Handle Offer Finished");
}

const handleAnswer = async (sender, answer) => {
    console.log("Handle Answer Started");
    await localConnections[sender].setRemoteDescription(answer);
    console.log("Handle Answer Finished");
}

function toggleMicrophone() {
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;  
    });
}

function toggleSpeaker() {
    var audioElements = document.getElementById("audio-zone");
    var children = audioElements.children;
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.tagName == "AUDIO") {
            child.muted = !child.muted;
        }
    }
}

function closeTab() {
    window.close();
}
