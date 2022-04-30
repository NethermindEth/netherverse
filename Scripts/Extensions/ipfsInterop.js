// send file to ipfs
var node;
async function InitializeIPFSNode (callback) {
    node = await IPFS.create();
}
async function SendFile(bytes) {
    if(node == null) {
        await InitializeIPFSNode();
    }

    var results = await node.add(bytes);
    var hash = results[0].hash;
    return hash;
}

async function GetFile(hash) {
    if(node == null) {
        await InitializeIPFSNode();
    }

    var bytes = await node.cat(hash);
    return bytes;
}
