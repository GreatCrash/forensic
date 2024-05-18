const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // 동기 파일 시스템 모듈
const cors = require('cors');
const archiver = require('archiver');
const formidable = require('formidable');
const util = require('util');
const fsExtra = require('fs-extra'); // 파일 시스템 관련 기능을 제공하는 모듈 (fs 모듈의 확장판)

const app = express();
const port = process.env.PORT || 3000; // 클라우드타입 환경에서는 process.env.PORT 사용

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 파일 업로드 및 Foremost 실행을 처리하는 엔드포인트
app.post('/recover', (req, res) => {
    const form = new formidable.IncomingForm();
    form.multiples = true;
    const tempFolderPath = path.join(__dirname, 'temp');
    const outputPath = path.join(__dirname, 'output');

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing the files: ', err);
            return res.status(400).send('Error parsing the files');
        }

        // 파일 이동 및 Foremost 실행
        form.on('end', async () => {
            try {
                // temp 및 output 디렉토리 생성
                await fs.mkdir(tempFolderPath, { recursive: true });
                await fs.mkdir(outputPath, { recursive: true });

                // 기존 temp 및 output 디렉토리 내용 삭제
                const tempFiles = await fs.readdir(tempFolderPath);
                await Promise.all(tempFiles.map(file => fs.unlink(path.join(tempFolderPath, file))));

                const outputFiles = await fs.readdir(outputPath);
                await Promise.all(outputFiles.map(async (file) => {
                    const filePath = path.join(outputPath, file);
                    const stat = await fs.stat(filePath);
                    if (stat.isDirectory()) {
                        await fs.rmdir(filePath, { recursive: true });
                    } else {
                        await fs.unlink(filePath);
                    }
                }));

                // 업로드된 파일을 temp 디렉토리로 이동
                for (let i = 0; i < this.openedFiles.length; i++) {
                    const tempPath = this.openedFiles[i].path;
                    const fileName = this.openedFiles[i].name;
                    const newLocation = path.join(tempFolderPath, fileName);

                    await fsExtra.move(tempPath, newLocation);
                    console.log(`File moved to: ${newLocation}`);

                    // Foremost 명령 실행
                    const cmd = `foremost -i ${newLocation} -o ${outputPath}`;
                    exec(cmd, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`exec error: ${error}`);
                            return res.status(500).json({ error: 'Recovery failed' });
                        }

                        console.log(`stdout: ${stdout}`);
                        console.error(`stderr: ${stderr}`);
                    });
                }

                const recoveredFolderName = "recoveredFolderName";
                res.json({ folderName: recoveredFolderName, recoveredFiles: [] });

            } catch (err) {
                console.error('Failed to process files:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        });
    });
});

// ZIP 파일로 압축하여 다운로드하는 엔드포인트
app.get('/download-files', (req, res) => {
    const outputFolderPath = path.join(__dirname, 'output');
    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
            console.warn(err);
        } else {
            throw err;
        }
    });

    archive.on('error', (err) => {
        console.error('Error creating ZIP archive:', err);
        res.status(500).send('Error creating ZIP archive');
    });

    res.attachment('output_files.zip');

    archive.pipe(res);
    archive.directory(outputFolderPath, false);
    archive.finalize();
});

// 기본 페이지를 제공하는 엔드포인트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP 서버 시작
app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`);
});
