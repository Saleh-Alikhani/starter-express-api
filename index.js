const express = require('express');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  $Command,
} = require('@aws-sdk/client-s3');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const { default: axios } = require('axios');

require('dotenv').config();

const s3 = new S3Client({
  region: 'default',
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let subs = [],
  users = [],
  saveTimer,
  server;

const saveFile = async () => {
  console.log('Saving File...');
  const putParams = {
    Body: JSON.stringify(subs),
    Bucket: process.env.LIARA_BUCKET_NAME,
    Key: 'subs.txt',
  };
  return await s3.send(new PutObjectCommand(putParams));
};

const apiGuard = (req, res, next) => {
  const token = req.headers.authorization;
  console.log('Authorizing...');
  if (!token) {
    console.log('Authorizition Failed.');
    return res.status(401).send();
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send();
    }
    req.user = user;
    console.log(user.username, 'authorized.');

    next();
  });
};

const errorCatcher = (err) => {
  //console.log('Bucket unreachable turning app off...', err);
  //s3.destroy();
  //server.close();
};

s3.send(
  new GetObjectCommand({
    Bucket: process.env.LIARA_BUCKET_NAME,
    Key: 'users.txt',
  })
)
  .then((e) => {
    console.log('Fetching users.txt done.');
    const parsed = JSON.parse(e.Body.read());
    if (parsed !== null) {
      users = parsed;
    }
  })
  .catch(errorCatcher);

s3.send(
  new GetObjectCommand({
    Bucket: process.env.LIARA_BUCKET_NAME,
    Key: 'subs.txt',
  })
)
  .then((e) => {
    console.log('Fetching subs.txt done.');

    const parsed = JSON.parse(e.Body.read());
    if (parsed !== null) {
      subs = parsed;
    }
  })
  .catch(errorCatcher);

app.post('/add', apiGuard, (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).end();
  }
  subs.push(req.body);
  if (!saveTimer) {
    saveTimer = setTimeout(() => saveFile(), 180000);
  } else {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveFile(), 180000);
  }

  res.status(200).send(subs);
});

app.post('/delete', apiGuard, (req, res) => {
  subs.splice(req.body.index, 1);
  if (!saveTimer) {
    saveTimer = setTimeout(() => saveFile(), 180000);
  } else {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveFile(), 180000);
  }
  res.status(200).send(subs);
});

app.post('/addBulk', apiGuard, (req, res) => {
  subs = subs.concat(req.body);

  if (!saveTimer) {
    saveTimer = setTimeout(() => saveFile(), 180000);
  } else {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveFile(), 180000);
  }

  res.status(200).send(subs);
});

app.post('/deleteBulk', apiGuard, (req, res) => {
  subs = subs.filter((_, i) => !Array(...req.body).includes(i));
  res.status(200).send(subs);
});

app.get('/get', apiGuard, (_, res) =>
  res.status(200).setHeader('Access-Control-Allow-Origin', '*').send(subs)
);

app.post('/login', async (req, res) => {
  console.log(req.body);
  for (let value of users) {
    if (value.username === req.body.username) {
      const valid = await bcrypt.compare(req.body.password, value.password);
      console.log(valid);
      if (valid) {
        console.log('signing jwt.');
        res.status(200).send(
          JSON.stringify({
            token: jwt.sign(
              {
                username: value.username,
              },
              process.env.JWT_SECRET,
              { expiresIn: '1800s' }
            ),
          })
        );
      }
    }
  }
  res.status(404).end();
});

app.post('/signup', async (req, res) => {
  const pass = await bcrypt.hash(req.body.password, 13);
  const user = { username: req.body.username, password: pass };
  users.push(user);
  await s3.send(
    new PutObjectCommand({
      Key: 'users.txt',
      Body: JSON.stringify(users),
      Bucket: process.env.LIARA_BUCKET_NAME,
    })
  );
  res.status(200).end();
});

app.get('/tel', async (req, res) => {
  try {
    let str;
    await axios
      .get('https://t.me/s/' + req.query.target)
      .then((response) => (str = String(response.data)))
      .catch((err) => (str = ''));
    const vlessRegex = new RegExp(/(vless:\/\/[^\#\s\n]*)(\#[^\s\n<]+)/g);
    const vmessRegex = new RegExp(/(vmess:\/\/[^\#\s\n]*)(\#[^\s\n<]+)/g);
    const ssRegex = new RegExp(/(ss:\/\/[^\#\s\n]*)(\#[^\s\n<]+)/g);
    const trojanRegex = new RegExp(/(trojan:\/\/[^\#\s\n]*)(\#[^\s\n<]+)/g);
    const result = [...str.matchAll(vlessRegex),...str.matchAll(vmessRegex),...str.matchAll(ssRegex),...str.matchAll(trojanRegex)];
    const subs = [];
    for (let i of result) {
      if (!subs.includes(i[0])) {
        subs.push(i[0]);
      }
    }
    res.send(subs.join('\n'));
  } catch (err) {
    console.log(err, 'b');
  }
});

server = app.listen(process.env.PORT || 3000, () => {
  console.log('listening...');
});
