var browserify = require('browserify');
var stylus = require("stylus");
var express = require("express");
var nib = require("nib");
var serverStatic = require('serve-static');
var bodyParser = require('body-parser');
var path = require('path');
var Q = require('q');
var qfs = require('q-io/fs');
var findAllFiles = require("./findAllFiles");
var isImage = require("../common/isImage");
var Diaporama = require("./Diaporama");
var DiaporamaRecorderServer = require("diaporama-recorder/server");
var Thumbnail = require("./Thumbnail");

module.exports = function server (diaporama, port) {
  var app = express();

  var http = require('http').Server(app);
  var io = require('socket.io')(http);

  // TODO: ports
  if (!port) port = 9325;

  app.use(bodyParser.json());

  app.get('/index.js', function (req, res) {
    var b = browserify();
    b.transform(require("reactify"));
    b.add(path.join(__dirname, '../app/index.js'));
    b.bundle().pipe(res.type("js"));
  });

  app.get('/index.css', function (req, res) {
    qfs.read(path.join(__dirname, '../app/index.styl'))
      .then(function (styl) {
        return stylus(styl)
          .set('paths', [
            path.join(__dirname, '../node_modules'),
            path.join(__dirname, '../app')
            ])
          .use(nib()).import('nib');
      })
      .ninvoke("render")
      .then(function (css) {
        res.type("css").send(css);
      }, function (e) {
        console.error(e);
        res.status(400).send(e.message);
      });
  });

  app.get('/listfiles', function (req, res) {
    findAllFiles(diaporama.dir, isImage)
      .then(JSON.stringify)
      .then(function (json) {
        res.type("json").send(json);
      }, function (e) {
        console.error(e);
        res.status(400).send(e.message);
      });
  });

  app.post("/diaporama/generate/html", function (req, res) {
    Diaporama.generateHTML(diaporama.dir)
      .then(function () {
        res.status(204).send();
      }, function (e) {
        console.error(e);
        res.status(400).send(e.message);
      });
  });

  app.post("/diaporama/bootstrap", function (req, res) {
    diaporama.bootstrap(req.body)
      .then(function (diaporama) {
        res.type("json").send(JSON.stringify(diaporama.json));
      })
      .fail(function (e) {
        console.error(e);
        res.status(400).send(e.message);
      });
  });

  app.get('/diaporama.json', function(req, res) {
    if (!diaporama.json)
      res.status(204).send();
    else
      res.type("json").send(JSON.stringify(diaporama.json));
  });

  app.post('/diaporama.json', function(req, res) {
    diaporama.trySet(req.body)
      .post("save")
      .then(function () {
        res.type("json").send({});
      }, function (e) {
        console.error(e);
        res.status(400).send(e.message);
      })
      .done();
  });

  Thumbnail(app, "preview", ".");

  app.use(serverStatic(path.join(__dirname, '../app'), { 'index': ['index.html'] }));

  DiaporamaRecorderServer(io);

  var defer = Q.defer();
  http.listen(port, function (err) {
    if (err) defer.reject(err);
    else {
      var url = "http://localhost:"+port;
      console.log("Listening on "+url);
      defer.resolve(url);
    }
  });

  return defer.promise;
};
