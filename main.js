// imports
const axios = require("axios");
const SimpleCrypto = require("simple-crypto-js").default;
const fs = require("fs");
const pdfPrint = require("unix-print")

//routes requests
const reqPullURL = "http://dev-print.api.hopn.space/print_requests/pull/"
const baseReqURL = "http://dev-print.api.hopn.space/print_requests/"
const baseDocURL = "http://dev-print.api.hopn.space/documents/"
const pinPullURL = "http://dev-print.api.hopn.space/pin/pull/"
const basePinURL = "http://dev-print.api.hopn.space/pin/"
const baseLogURL = "http://dev-print.api.hopn.space/logs/"
const logPullURL = "http://dev-print.api.hopn.space/logs/pull/"
const baseStatusURL= "http://dev-print.api.hopn.space/status/"
const statusPullURL= "http://dev-print.api.hopn.space/status/pull/"
const basePrinterURL= "http://dev-print.api.hopn.space/printers/"



//const
const printerId = "printer_e9167a0d34d9bc5d1"
const printerBrand = "Canon"
const printerSerial = "5554-333-444-888"
const printerModel = "Super GX couleur ZX9000"
const printerUniqueCode = "NOV-MET-002"

const printer = {
    "id":printerId,
    "brand":printerBrand,
    "serial":printerSerial,
    "model":printerModel,
    "uniqueCode":printerUniqueCode
}

let currentStatus = {
    "ink_level_cyan":100,
    "ink_level_magenta":100,
    "ink_level_yellow":100,
    "ink_level_black":100,
    "is_available":1
}


const timer = 3000
const maxPinAttempts = 5
const maxPinAPITicks = 3


// delay function to mimic a request to API
const delay = ms => new Promise(res => setTimeout(res, ms));




// Initiate the script

console.log("__________________________________________________________")

mainScript2().then(() => {
    console.log("MainScript fulfilled")
    console.log("__________________________________________________________")

}).catch(reason => {
    console.log(reason)
    console.log("MainScript failed")
    console.log("__________________________________________________________")

})







// New version of main script, now in synchronous mode with better factorisation
async function mainScript2() {
    // booleans
    let pinCodeFound = false;
    let pinTimeOut = false
    let printSuccess = false


// counters
    let reqAPITick = 0
    let pinAPITick = 0
    let pinAttempts = 0


//fetched data
    let statusData = null;
    let requestData = null;
    let documentData = null;

//crypto
    let encryptedText;
    let encryptedPin;


    // main Script methods
    /**
     *     Call the API to get the printer's status and set the value.
     *     If the data array is empty, catch the error and let the statusData null
     */
    async function checkDBStatus() {
        console.log("Looking for Status")
        await axios.get(statusPullURL + printerId)
            .then(r => {
                statusData = r.data.content.body[0]
                console.log("Status Found")
                console.log(statusData)
            }).catch(reason => {
                console.log("no data")
                console.log(reason)
            })
    }

//--------------------------------------------------------------------
    /**
     * Update printer data. Add Brand, Model, Serial and UniqueCode
     */
    function initializePrinter() {
        axios.put(basePrinterURL + printerId, printer)
            .then(r => {
                console.log("Printer updated")
                console.log(r.data)
            })
            .catch(reason => {
                console.log("Printer update error")
                console.log(reason)
            })
    }

//--------------------------------------------------------------------

    /**
     * Called when there's no status, post a new status entry with preset values and try to initialize the Printer
     */
    function createStatus() {

        axios.post(baseStatusURL, {'printer': printerId})
            .then(() => {

                try {
                    initializePrinter()
                } catch (e) {
                    console.log("printer initialisation error")
                    console.log(e)
                }
            })
            .catch(reason => {
                console.log("Status Creation Error")
                console.log(reason)
            })
    }

//--------------------------------------------------------------------

    async function updateStatus() {

        console.log("Start updating Status")
        const actualCyan = currentStatus.ink_level_cyan
        const actualMagenta = currentStatus.ink_level_magenta
        const actualYellow = currentStatus.ink_level_yellow
        const actualBlack = currentStatus.ink_level_black
        const actualAvailability = currentStatus.is_available


        await axios.put(baseStatusURL + statusData.id, {
            'ink_level_cyan': actualCyan,
            'ink_level_magenta': actualMagenta,
            'ink_level_yellow': actualYellow,
            'ink_level_black': actualBlack,
            'is_available': actualAvailability,
        })
            .then(r => {
                statusData = r.data.content.body
                console.log("Status updated")
            })
            .catch(reason => {
                console.log("Status update error")
                console.log(reason)
            })
    }

//--------------------------------------------------------------------

    async function checkRequests() {


        reqAPITick++
        console.log("Searching for a print request : " + reqAPITick)

        //first step : find a request matching the printer id every n sec
        await axios.get(reqPullURL + printerId)
            .then(async response => {

                if (response.data.content.body.length !== 0) {
                    requestData = response.data.content.body[0]
                } else {
                    console.log("No Request found")
                }
            }).catch(reason => {
                console.log("axios error get : request + printerId")
                requestFound = false
                console.log(reason)
            })

    }

    //--------------------------------------------------------------------

    async function retrieveFile() {
        const documentUrl = baseDocURL + requestData.document_id + "/download"
        await delay(5000)
        console.log(documentUrl)
        await axios.get(documentUrl)
            .then(async response => {
                documentData = response.data.content.body.document
                encryptedText = response.data.content.body.text
            }).catch(() => {
                console.log("no document found")
            });
    }

//--------------------------------------------------------------------

    async function addPrintRequestLog(document) {
        try {
            await checkPinAttempts(document).then(()=>{
                console.log("checkPinAttempts fulfilled")
                console.log(pinAttempts)
            }).catch(()=>{
                console.log("checkPinAttempts rejected")
            })
            const message = {"reason": "Print requested", "pinAttempt": pinAttempts}
            const stringMess = JSON.stringify(message)
            await axios.post(baseLogURL, {"message": stringMess, "document": document})
                .then(r => {
                    console.log(r.data.content.body)
                }).catch(reason => {
                    console.log(reason)
                })
        } catch (e) {
            console.log(e)
        }
    }

//--------------------------------------------------------------------

    async function checkPinAttempts(id) {
        await axios.get(logPullURL + id).then(response => {
            const logs = response.data.content.body
            console.log(logPullURL + id)
            console.log(logs)
            if (logs.length === 0) {
                pinAttempts = 0
            } else {
                const logMessage = JSON.parse(logs[logs.length - 1].message)
                if (logMessage.pinAttempt === undefined) {
                    pinAttempts = 0
                    logMessage.pinAttempt = pinAttempts
                }
                pinAttempts = logMessage.pinAttempt
            }
        }).catch(() => {
            console.log("no Logs found, assuming no Attempts")
            pinAttempts = 0
        })
    }

//--------------------------------------------------------------------

    async function findPinCode() {
        await axios.get(pinPullURL + requestData.id)
            .then(async r => {
                const dataPin = r.data.content.body[0]
                encryptedPin = dataPin.pin
                pinCodeFound = true
                pinAttempts++
                pinAPITick = 0

                await deletePin(dataPin.id)
                    .then(() => {
                        console.log("deletePin success")
                    })
                    .catch(() => {
                        console.log("deletePin rejected")
                    })

            })
            .catch(async () => {
                pinCodeFound = false
                console.log("no Pin found")
                await delay(2000)
            })

    }

//--------------------------------------------------------------------
    async function addPinAttemptLog() {
        const message = {"reason": "Pin submitted", "pinAttempt": pinAttempts}
        const stringMess = JSON.stringify(message)
        await axios.post(baseLogURL, {"message": stringMess, "document": requestData.document_id})
            .then(r => {
                console.log(r.data.content.body)
            }).catch(reason => {
                console.log(reason)
            })
    }

//--------------------------------------------------------------------

    async function processFile() {
        // first decrypt Pin
        const simpleDecryptPin = new SimpleCrypto(printerId)
        let decryptedPin
        try {
            decryptedPin = simpleDecryptPin.decrypt(encryptedPin)

        } catch (e) {
            console.log("Pin decryption error " + e)
            return false
        }
        // then decrypt File
        try {
            const simpleDecryptFile = new SimpleCrypto(decryptedPin)
            const decryptedText = simpleDecryptFile.decrypt(encryptedText)
            console.log("file decrypted")

            // once the file is decrypted, save the file and when the file is saved, the file is printed
            await fs.writeFile(
                "./file/temp.pdf",
                decryptedText.toString(),
                'binary',
                () => {
                    console.log("file downloaded")
                    printFile()
                        .then(()=>{
                            console.log("printFile success")
                        })
                        .catch(()=>{
                            console.log("printFile rejected")
                        })
                })
            return  true

        } catch (e) {
            console.log("file decryption error")
            console.log(e)
            return  false
        }
    }

//--------------------------------------------------------------------

    async function printFile() {
        try {
            console.log("Print start")
            await pdfPrint.print("file/temp.pdf").then(()=> {
                printSuccess = true
                console.log("print ended successfully")
            })


        } catch (e) {
            console.log("file not printed")
            console.log(e)
        }
    }

//--------------------------------------------------------------------
    async function deleteFile() {
        // check every requests on this file and delete them

        await axios.get(reqPullURL + printer.id)
            .then(async r => {
                const requests = r.data.content.body
                console.log("requests")
                console.log(reqPullURL + printer.id)
                console.log(requests)
                await delay(timer)
                if (requests.length !== 0) {
                    for (const request of requests) {
                        console.log(request)
                        try {
                            await deleteRequest(request.id)
                        } catch (e) {
                            console.log(e)
                        }
                    }
                }
            })
            .catch(reason => {
                console.log(reason)
            })

        //delete the file
        await axios.delete(baseDocURL + documentData.id).then(() => {
            console.log("File deleted")
        }).catch(reason => {
            console.log(reason)
        })
    }

//--------------------------------------------------------------------

    async function deleteRequest(id) {
        // check for pin attempts and delete them
        await axios.get(pinPullURL + id)
            .then(async r => {
                const pins = r.data.content.body
                console.log("pins")
                console.log(pinPullURL + id)
                console.log(pins)
                await delay(timer)
                if (pins.length !== 0) {
                    for (const pin of pins) {
                        console.log(pin)
                        try {
                            await deletePin(pin.id).then(() => {
                                console.log("deletePin fulfilled")
                            }).catch(() => {
                                console.log("deletePin rejected")
                            })
                        } catch (e) {
                            console.log(e)
                        }
                    }
                }
            })
            .catch(reason => {
                console.log(reason)
            })
        // delete the request

        await axios.delete(baseReqURL + id)
            .then(() => {
                console.log("Request deleted")
            })
            .catch(reason => {
                console.log(reason)
            })

    }

//--------------------------------------------------------------------

    async function deletePin(id) {
        await axios.delete(basePinURL + id)
            .then(() => {
                console.log("Pin deleted")
            })
            .catch(reason => {
                console.log(reason)
            })

    }

//--------------------------------------------------------------------
    function resetScript() {
        // booleans
        pinCodeFound = false;
        pinTimeOut = false
        printSuccess = false;


// counters
        reqAPITick = 0
        pinAPITick = 0
        pinAttempts = 0


//fetched data
        statusData = null;
        requestData = null;
        documentData = null;

//crypto
        encryptedText="";
        encryptedPin="";
    }

//--------------------------------------------------------------------
    async function updateInkLevel(page) {
        console.log("updating ink level :" + page + " has been printed")
        currentStatus.ink_level_black-=page
        await delay(timer)
        await updateStatus()
            .then(()=>{
                console.log("updateStatus fulfilled")
            }).catch(()=>{
                console.log("updateStatus rejected")})
    }


//--------------------------------------------------------------------



    // Main Script starts here
    do {

        /** First : The script request the API for the Printer Status
         * If there're none, the printer is initialized
         * Then the status entry of this printer is updated or created
         */
        do {
            try {
                await checkDBStatus().then(() => {
                    console.log("checkDBStatus fulfilled")
                    if (statusData === null || statusData === undefined) {
                        console.log("No Status yet")
                        console.log("Creating a new status")
                        createStatus()
                    } else {
                        console.log("Status OK - processing to the next step")
                    }
                }).catch(reason => {
                    console.log("checkDBStatus failed")
                    console.log(reason)
                })

            } catch (e) {
                console.log("error Status Check")
                console.log(e)
            }
            await delay(timer)


        } while (statusData === null || statusData === undefined)

        try {
            await updateStatus().then(() => {
                console.log("updateStatus fulfilled")
            }).catch(reason => {
                console.log("updateStatus rejected")
                console.log(reason)
            })
        } catch (e) {
            console.log("error updating status")
            console.log(e)
        }
        /**
         * There, the script loops API requests to find print requests
         */

        do {
            await checkRequests().then(() => {
                console.log("checkRequest fulfilled")
                console.log(requestData)
            }).catch(reason => {
                console.log("checkRequest rejected")
                console.log(reason)
            })
            await delay(timer)
        } while (requestData===undefined || requestData===null)

        /**
         * When the request is found, the script download the encrypted file
         */

        const documentFound = async () => await retrieveFile()
            .then(() => {
                console.log("retrieveFile fulfilled")
                return true
            }).catch(reason => {
                console.log("retrieveFile rejected")
                console.log(reason)
                return false
            })


        if (await documentFound()) {
            await addPrintRequestLog(requestData.document_id)
                .then(() => {
                    console.log("addPrintRequestLog fulfilled")
                })
                .catch(reason => {
                    console.log("addPrintRequestLog rejected")
                    console.log(reason)
                })

            /**
             * Loops pin attempts requests until the script finds one
             * MaxAPITicks defines the time out before the request is deleted
             * Max pin Attempts defines how many trys the user can have before the file is deleted
             */
            do {

                /**
                 * Loops pin attempts on API and increment ticks
                 */
                do {
                    console.log("pin attempts = " + pinAttempts)
                    console.log("pinAPITick = " + pinAPITick)
                    pinAPITick++
                    if (pinAttempts <= maxPinAttempts && pinAPITick <= maxPinAPITicks) {
                        await findPinCode()
                            .then(() => {
                                console.log("findPinCode fulfilled")
                            })
                            .catch(reason => {
                                console.log("findPinCode rejected")
                                console.log(reason)
                            })
                    } else {
                        pinTimeOut = true
                    }
                } while (!pinCodeFound && !pinTimeOut)

                if (pinCodeFound) {

                    await addPinAttemptLog().then(() => {
                        console.log("addPinAttemptLog fulfilled")
                    }).catch(reason => {
                        console.log("addPinAttemptLog rejected")
                        console.log(reason)
                    })


                    await processFile()
                        .then(()=>{
                            console.log("processFile fulfilled")

                        })
                        .catch(()=>{
                            console.log("processFile rejected")
                        })


                } else {
                    if (pinTimeOut) {
                        if (pinAttempts >= maxPinAttempts) {
                            console.log("Max Pin attempts reached - Deleting file")

                            await deleteFile().then(() => {
                                console.log("deleteFile fulfilled")
                            }).catch(() => {
                                console.log("deleteFile rejected")
                            })

                        } else if (pinAPITick >= maxPinAPITicks) {
                            console.log("Pin TimeOut - Deleting request")

                            await deleteRequest(requestData.id)
                                .then(() => {
                                    console.log("deleteRequest fulfilled")
                                })
                                .catch(() => {
                                    console.log("deleteRequest rejected")
                                })
                        }
                    }
                }
            } while (!printSuccess && !pinTimeOut)
            if (printSuccess) {
                await deleteFile()
                    .then(()=>{
                        console.log("file deleted")
                    })
                    .catch(()=>{
                        console.log("deleteFileRejected")})
                await updateInkLevel(documentData.page_count)
                    .then(()=>{
                        console.log("updateInkLevel fulfilled")})
                    .catch(()=>{
                        console.log("updateInkLevel rejected")
                    })
            }
        } else {
            await deleteRequest(requestData.id)
        }
        resetScript()
    } while (true)
}
















