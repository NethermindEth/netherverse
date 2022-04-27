const GetPresentation =  async (targetObj) => {
    const processZip = async (zip) => {
        // get all the files in the zip
        var files = zip.files;
        var promises = [];
        // convert each file to an image
        for (var key in files) {
            if (files.hasOwnProperty(key)) {
                var file = files[key];
                // only process images
                if (file.name.endsWith(".jpg") || file.name.endsWith(".jpeg")) {
                    promises.push(file.async("base64"));
                }
            }
        }
        // wait for all the images to be converted
        return await Promise.all(promises);
    }

    
    GetLocalFile(async data => {
        var zip = new JSZip();
        var images = await zip.loadAsync(data).then(processZip);
        WebglInstance.SendMessage("GameManager", "SetPresentation", targetObj, JSON.stringify(images));
    });
}

const GetLocalFile = async (callBack) => {
    var input = document.createElement('input');
    input.type = 'file';
    var byteData;
    input.onchange = e => { 

    // getting a hold of the file reference
        var file = e.target.files[0]; 

        // setting up the reader
        var reader = new FileReader();
        // get byte data in file
        reader.readAsArrayBuffer(file);
        // get file data


        // here we tell the reader what to do when it's done reading...
        reader.onload = readerEvent => {
            byteData = readerEvent.target.result; // this is the content!
            callBack(byteData);
        }
    
    }

    input.click();
}
