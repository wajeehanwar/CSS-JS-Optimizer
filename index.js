const express = require("express");
const upload = require("express-fileupload");
const archiver = require("archiver");
const del = require("del");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const workingDirectory = path.join(__dirname, "workingdirectory");

app.set("view engine", "ejs");
app.use(upload());
app.use(express.urlencoded({
    extended: false
}));

app.get("/", (request, response) => {
    response.sendFile(__dirname + "/index.html");
});

app.post("/options", (request, response) => {
    console.log("/options ==>");
    if (request.files) {
        function process() {
            return new Promise(function (resolve, reject) {
                const file = request.files.coveragemap;
                const filename = request.files.coveragemap.name;
                const randomizer =
                    Math.floor(Math.random() * (Math.floor(99) - Math.ceil(10))) +
                    Math.ceil(10);
                const id = `_${randomizer}_${Date.now()}`;
                const thisWorkingDirectory = `${workingDirectory}${id}`;
                const processedFiles = path.join(thisWorkingDirectory, "processedfiles");
                const fileList = [];
                const percentageUsed = [];

                // Make working directories.
                fs.mkdir(thisWorkingDirectory, err => {
                    if (err) {
                        throw err;
                    }
                    console.log(`${thisWorkingDirectory} created...`);
                    fs.mkdir(processedFiles, err => {
                        if (err) {
                            throw err;
                        }
                        console.log("Processed files directory created...");
                    });
                });

                file.mv(path.join(thisWorkingDirectory, filename), error => {
                    if (error) {
                        throw error;
                    } else {
                        console.log(`${filename} saved to working directory`);

                        // List files affected by coverage.json
                        fs.readFile(
                            path.join(thisWorkingDirectory, filename),
                            "ascii",
                            (err, data) => {
                                if (err) {
                                    throw err;
                                }

                                // Converting to JSON
                                const coverageMap = JSON.parse(data);

                                // Process each file in working directory
                                coverageMap.forEach(file => {

                                    fileList.push(file.url);

                                    // calculate percentage of file used
                                    let usedCode = 0;
                                    file.ranges.forEach(range => {
                                        usedCode += range.end - range.start;
                                    });
                                    percentageUsed.push((100 / file.text.length) * usedCode);
                                    console.log(`Evaluating ${file.url}: ${(100 / file.text.length) * usedCode}...`);

                                });
                            }
                        );

                    }
                });
                resolve();
            });
        }

        (async function () {
            let arr = await process();
            console.log(`*** ${fileList}`);
            response.render("options", {
                directory: thisWorkingDirectory,
                uid: id,
                coveragemap: JSON.stringify(filename),
                files: fileList,
                usage: percentageUsed,
                tiles: ["a", "b", "c"]
            });
        })();
    }
});


app.post("/coverage", (request, response) => {
    console.log("/coverage ==>");
    //console.log(request.body.directory);
    const filename = request.body.coveragemap;
    const thisWorkingDirectory = request.body.directory;
    const processedFiles = path.join(thisWorkingDirectory, "processedfiles");

    // (async () => {

    // List files affected by coverage.json
    // await 
    fs.readFile(
        path.join(thisWorkingDirectory, filename),
        "ascii",
        (err, data) => {
            if (err) {
                throw err
            };

            // Converting to JSON
            const coverageMap = JSON.parse(data);

            // Process each file in working directory
            coverageMap.forEach(file => {
                const filePath = path.join(
                    processedFiles,
                    path.basename(file.url)
                );

                // Create substring of all used ranges.
                let text = "";
                file.ranges.forEach(range => {
                    text += file.text.substring(range.start, range.end);
                });

                // Write substring to new file
                fs.writeFile(filePath, text, err => {
                    if (err) {
                        throw err;
                    }
                    console.log(
                        `Writing optimized ${path.basename(filePath)}...`
                    );
                });
            });

            // Create a file to stream archive data to.
            var output = fs.createWriteStream(
                path.join(
                    thisWorkingDirectory,
                    "/optimized-coverage-package.zip"
                )
            );
            const archive = archiver("zip", {
                zlib: {
                    level: 9
                }
            });

            // Listen for all archive data to be written
            // 'close' event is fired only when a file descriptor is involved
            output.on("close", function () {
                console.log(
                    `Compressing optimized files (${archive.pointer()} bytes)...`
                );
            });

            // This event is fired when the data source is drained no matter what was the data source.
            // It is not part of this library but rather from the NodeJS Stream API.
            // @see: https://nodejs.org/api/stream.html#stream_event_end
            output.on("end", function () {
                console.log("Data has been drained");
            });

            // Good practice to catch warnings (ie stat failures and other non-blocking errors)
            archive.on("warning", function (err) {
                if (err.code === "ENOENT") {
                    // Log warning
                } else {
                    throw err;
                }
            });

            // Good practice to catch this error explicitly
            archive.on("error", function (err) {
                throw err;
            });

            // Pipe archive data to the file
            archive.pipe(output);

            // Append files from a sub-directory, putting its contents at the root of archive
            archive.directory(processedFiles, false);

            // Finalize the archive (ie we are done appending files but streams have to finish yet)
            // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
            archive.finalize();
        }
    );
    response.render("optimizerequest", {
        directory: thisWorkingDirectory,
    });
    // })();

});

app.post("/download", (request, response) => {
    const thisWorkingDirectory = request.body.directory;
    console.log("Sending optimized zip file for download...");

    response.download(
        thisWorkingDirectory + "/optimized-coverage-package.zip",
        "optimized-coverage-package.zip"
    );
    console.log("Sending download file...");

    // Delete working directory
    (async () => {
        await del([thisWorkingDirectory]);
        console.log(`Deleting ${thisWorkingDirectory} ...`);
    })();
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));