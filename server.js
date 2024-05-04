const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const archiver = require('archiver');
const multer = require('multer');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

app.post('/recover', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const tempFolderPath = path.join(__dirname, 'temp');
  const tempFilePath = path.join(tempFolderPath, file.originalname);

  try {
    // temp 폴더 내부의 기존 파일 삭제
    const tempFiles = await fs.readdir(tempFolderPath);
    await Promise.all(tempFiles.map(file => fs.unlink(path.join(tempFolderPath, file))));

    // 새로 업로드한 파일 저장
    await fs.writeFile(tempFilePath, file.buffer);

    const outputPath = path.join(__dirname, 'output');

    // output 폴더 내부의 기존 파일 및 폴더 삭제
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

    const cmd = `foremost -i ${tempFilePath} -o ${outputPath}`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return res.status(500).json({ error: 'Recovery failed' });
      }

      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);

      fs.unlink(tempFilePath, (err) => {
        if (err) {
          console.error('Failed to delete temporary file:', err);
        }
      });

      const recoveredFolderName = "recoveredFolderName";
      res.json({ folderName: recoveredFolderName, recoveredFiles: [] });
    });
  } catch (err) {
    console.error('Failed to process files:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/check-recovery', (req, res) => {
  const folder = req.query.folder;
  const recoveryPath = path.join(__dirname, 'output', folder);

  fs.readdir(recoveryPath, (err, files) => {
    if (err) {
      console.error('Error reading recovery folder:', err);
      return res.status(500).json({ error: 'Failed to read recovery folder', recoveredFiles: [] });
    }

    const recoveredFiles = files.filter(file => file !== 'audit.txt');

    if (recoveredFiles.length === 0) {
      fs.readdir(recoveryPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
          console.error('Error reading recovery folder:', err);
          return res.status(500).json({ error: 'Failed to read recovery folder', recoveredFiles: [] });
        }

        const recoveredFolders = entries.filter(entry => entry.isDirectory() && entry.name !== 'audit.txt');

        if (recoveredFolders.length > 0) {
          const folderNames = recoveredFolders.map(folder => folder.name);
          return res.json({ recoveredFiles: folderNames });
        } else {
          return res.json({ recoveredFiles: [] });
        }
      });
    } else {
      return res.json({ recoveredFiles });
    }
  });
});

app.get('/download-files', (req, res) => {
  const outputFolderPath = path.join(__dirname, 'output');
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('warning', function(err) {
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});