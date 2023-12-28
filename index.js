const express = require('express');
const { writeFileSync, readFileSync } = require('fs');

const app = express();
app.all('/', (req, res) => {
  console.log('Just got a request!');
  writeFileSync('/tmp/test.txt', 'req');

  res.send('Yo!');
});

app.get('/get', (req, res) => {
  const data = readFileSync('/tmp/test.txt');
  res.send(data);
});

app.listen(process.env.PORT || 3000);
