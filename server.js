'use strict';

// Module imports
var express = require('express')
  , restify = require('restify')
  , fs = require ('fs')
  , http = require('http')
  , bodyParser = require('body-parser')
  , util = require('util')
  , basicAuth = require('express-basic-auth')
  , passwordHash = require('password-hash')
  , log = require('npmlog-ts')
;

log.level     ='verbose';
log.timestamp = true;
const PROCESS = 'PROCESS';

// Instantiate classes & servers
var app    = express()
  , router = express.Router()
  , server = http.createServer(app)
;

// ************************************************************************
// Main code STARTS HERE !!
// ************************************************************************

// Main handlers registration - BEGIN
// Main error handler
process.on('uncaughtException', function (err) {
  log.error(PROCESS, "Uncaught Exception: " + err);
  log.error(PROCESS, "Uncaught Exception: " + err.stack);
});
// Detect CTRL-C
process.on('SIGINT', function() {
  log.info(PROCESS, "Caught interrupt signal");
  log.info(PROCESS, "Exiting gracefully");
  process.exit(2);
});
// Main handlers registration - END

// REST engine initial setup
const PORT = process.env.ADMINPORT || 9009;
const URI = '/admin';
const RACE = '/race';
const RACEOP = '/:raceop';
const RACEID = '/raceid';
const RACEIDPARAM = '/:raceid';
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(basicAuth( { authorizer: myAuthorizer } ));

// Other cnostants
const RACEIDFILE = process.env.HOME + '/setup/race_count.dat';
const username = 'pi';
const hashedPassword = 'sha1$0dca8e1b$1$af147f228501f5a55390ccdf7085e319c513311c';

// REST stuff - BEGIN
router.post(RACEID + RACEIDPARAM, function(req, res) {
  log.verbose(PROCESS, "Set raceid with: %j", req.params);
  var newRaceId = req.params.raceid;
  if ( isNaN(newRaceId) || parseInt(newRaceId) < 0) {
    res.status(400).send({ error: "You must enter a valid positive number for Race Id"});
    return;
  }
  fs.writeFile(RACEIDFILE, newRaceId, (err) => {
    if (err) {
      console.log(err);
      res.status(500).send(err);
      return;
    }
    res.status(204).send();
  });
});
router.get(RACEID, function(req, res) {
  log.verbose(PROCESS, "Get raceid");
  fs.readFile(RACEIDFILE, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      res.status(500).send(err);
      return;
    }
    res.status(200).send({ raceid: data });
  });
});

router.put(RACE + RACEOP, function(req, res) {
  log.verbose(PROCESS, "Operate race with: %j", req.params);
  var op = req.params.raceop;
  if (op.toLowerCase() === "start") {
    res.status(201).send();
  } else if (op.toLowerCase() === "stop") {
    res.status(204).send();
  } else {
    res.status(400).send();
  }
});

function myAuthorizer(_username, _password) {
    return (_username === username) && passwordHash.verify(_password, hashedPassword);
}

app.use(URI, router);
// REST stuff - END

server.listen(PORT, function() {
  log.info(PROCESS, "REST server running on http://localhost:" + PORT + URI);
});
