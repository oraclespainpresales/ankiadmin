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
  , moment = require('moment')
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
const EVENSERVERHOST = "http://helperhost:10001";
const EVENTURI = "/event/race";
const DBZONEHOST = "https://dbhost";
const DBZONEURI = "/apex/pdb1/anki/events/{demozone}/{date}";
const URI = '/admin';
const RACE = '/race';
const RACEOP = '/:raceop';
const RACEID = '/raceid';
const RACEIDPARAM = '/:raceid';
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(basicAuth( { authorizer: myAuthorizer } ));

var eventClient = restify.createJsonClient({
  url: EVENSERVERHOST,
  connectTimeout: 1000,
  requestTimeout: 1000,
  retry: false,
  headers: {
    "content-type": "application/json"
  }
});

var dbClient = restify.createJsonClient({
  url: DBZONEHOST,
  rejectUnauthorized: false
})

// Other constants
const SETUPFOLDER         = process.env.HOME + '/setup';
const DEMOZONEFILE        = SETUPFOLDER + '/demozone.dat';
const RACEIDFILE          = SETUPFOLDER + '/race_count.dat';
const RACESTATUSFILE      = SETUPFOLDER + '/race_status.dat';
const THERMOLAPFILE       = SETUPFOLDER + '/race_lap_Thermo.dat';
const SKULLLAPFILE        = SETUPFOLDER + '/race_lap_Skull.dat';
const GUARDIANLAPFILE     = SETUPFOLDER + '/race_lap_Guardian.dat';
const GROUNDSHOCKLAPFILE  = SETUPFOLDER + '/race_lap_Ground Shock.dat';
const LAPFILES = [ THERMOLAPFILE, SKULLLAPFILE, GUARDIANLAPFILE, GROUNDSHOCKLAPFILE ];
const username = 'pi';
const hashedPassword = 'sha1$0dca8e1b$1$af147f228501f5a55390ccdf7085e319c513311c';
const RACING  = "RACING";
const STOPPED = "STOPPED";

function checkScheduledDemo(callback) {

  var URI = DBZONEURI.replace("{demozone}", currentDemozone).replace("date", moment().format("MM-DD-YY"));
  dbClient.get(URI, function(err, req, res, obj) {
    if (err) {
      console.log(err);
      callback(false);
    }

    console.log(obj);
    callback(true);

  });
}

function setRaceId(id) {
  fs.writeFileSync(RACEIDFILE, id);
}

function getRaceId() {
  return fs.readFileSync(RACEIDFILE, 'utf8');
}

function resetRaceLapForCar(carFile) {
  fs.writeFileSync(carFile, "0");
}

function incRaceId() {
  var i = getRaceId();
  var newId = parseInt(i) + 1;
  setRaceId(newId);
  return newId;
}

function changeRaceStatus(status) {
  fs.writeFileSync(RACESTATUSFILE, status);
}

function sendEvent(demozone, raceId, status, callback) {
  var jsonPayload = [{
    payload: {
      data: {
        data_demozone: demozone,
        raceId: raceId,
        raceStatus: status
      }
    }
  }];
  eventClient.post(EVENTURI, jsonPayload, function(err, _req, _res, obj) {
    if (err) {
      console.log(err);
    }
    callback(err);
  });
}

// Read current demozone
var currentDemozone = fs.readFileSync(DEMOZONEFILE,'utf8');
log.info("PROCESS", "Working for demozone: '%s'", currentDemozone);

// REST stuff - BEGIN
router.post(RACEID + RACEIDPARAM, function(req, res) {
  log.verbose(PROCESS, "Set raceid with: %j", req.params);
  var newRaceId = req.params.raceid;
  if ( isNaN(newRaceId) || parseInt(newRaceId) < 0) {
    res.status(400).send({ error: "You must enter a valid positive number for Race Id"});
    return;
  }
  setRaceIdSync(newRaceId);
  res.status(204).send();
});

router.get(RACEID, function(req, res) {
  log.verbose(PROCESS, "Get raceid");
  res.status(200).send({ raceid: parseInt(getRaceId()) });
});

router.put(RACE + RACEOP, function(req, res) {
  log.verbose(PROCESS, "Operate race with: %j", req.params);
  var op = req.params.raceop;
  if (!op) {
    res.status(500).send("Missing raceop template parameter");
    return;
  }
  op = op.toLowerCase();
  if ( op !== "start" && op != "stop") {
    res.status(404).send();
    return;
  }
  if (!checkScheduledDemo()) {
  }

  checkScheduledDemo((scheduled) => {
    if (!scheduled) {
      res.status(403).send("No demo scheduled for today in demozone " + currentDemozone);
      return;
    } else {
      if (op === "start") {
        var r = incRaceId();
        LAPFILES.forEach((f) => {
          resetRaceLapForCar(f);
        });
        changeRaceStatus(RACING);
        sendEvent(currentDemozone, r, RACING, (err) => {
          if (err) {
            res.status(500).send(err);
          } else {
            res.status(200).send({ status: RACING, raceid: r });
          }
        });
      } else if (op === "stop") {
        changeRaceStatus(STOPPED);
        sendEvent(currentDemozone, r, STOPPED, (err) => {
          if (err) {
            res.status(500).send(err);
          } else {
            res.status(200).send({ status: STOPPED, raceid: r });
          }
        });
      }      
    }
  });

});

function myAuthorizer(_username, _password) {
    return (_username === username) && passwordHash.verify(_password, hashedPassword);
}

app.use(URI, router);
// REST stuff - END

server.listen(PORT, function() {
  log.info(PROCESS, "REST server running on http://localhost:" + PORT + URI);
});
