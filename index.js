/**
  * Handle arguments
  **/
var processArguments = {
	"name": "",
	"type": "",
	"config": {}
};

if (process.argv[2]) {
	try {
		var data = JSON.parse(process.argv[2]);
		
		for (var i in processArguments) {
			if (data[i]) {
				processArguments[i] = data[i];
			}
		}
		
		for (var i in data) {
			if (!processArguments[i]) {
				console.log("undefined key: " + i);
			}
		}
		
	}
	catch (e) {
		throw "expected argument to be JSON";
	}
}

if (processArguments.name === "" || processArguments.config.ip === undefined) {
	throw "expected JSON to contain a name and config.ip";
	return false;
}

if (!processArguments.config.interval) {
	processArguments.config.interval = 1000;
}

/**
  * DEFAULT API FUNCTION
  **/
const http = require('http');
const querystring = require('querystring');

function requestApi (uri, method, data, cb) {
	if (method === undefined) {
		method = "GET"
	}
	
	if (data === undefined) {
		data = {};
	}
	
	var req = http.request({
		host: "::1",
		port: 8123,
		path: "/api/" + uri,
		method: method,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	}, (res) => {
		var body = "";
		
		res.setEncoding('utf8');
		res.on('data', (chunk) => {
			body += chunk;
		});
		
		res.on('end', () => {
			if (cb) {
				cb(null, JSON.parse(body));
			}
		});
	});
	
	req.on('error', (e) => {
		if (cb) {
			cb({
				"httperror": e.message
			});
		}
	});

	
	req.write(querystring.stringify(data));
	req.end();
} 

var net = require('net');
var tcpSocket = false;

deviceChangeEvents = [];

function onDeviceChange(id, cb) {
	if (tcpSocket === false) {
		tcpSocket = new net.Socket();

		tcpSocket.connect(8124, '127.0.0.1', function() {
			
		});
		
		tcpSocket.on('data', function(data) {
			var json = false;
			try {
				json = JSON.parse(data);
			}
			catch (e) {
				
			}
			
			if (json.deviceValues) {
				for (var i = 0; i < deviceChangeEvents.length; i ++) {
					for (var id in json.deviceValues) {
						if (deviceChangeEvents[i].id == id) {
							deviceChangeEvents[i].cb(json.deviceValues[id]);
							break;
						}
					}
				}
			}
		});
	}
	
	deviceChangeEvents.push({
		id: id,
		cb: cb
	});
}



/**
  * LOGIC
  **/
  
var fs = require("fs");
if (false) {
	var mtime = false;
	function checkMTime () {
		fs.stat(__filename, function (err, res) { 
			if (mtime === false) {
				mtime = res.mtime.getTime();
			}
			else if (mtime !== res.mtime.getTime()) {
				thefileischanged();
			}
		})
	}
	
	setInterval(function () {
		checkMTime();
	}, 2000);
	checkMTime();
}




requestApi("device", "POST", {
	name: processArguments.name,
	type: "switch"
}, function (err, id) { 
	if (err) {
		throw "Error requesting the api";
	}
	else if (id === false) {
		throw "api returns strange result!";
	}
	else {
		requestApi("deviceValue/" + id, "GET", {}, function (err, curVal) {
			var isInErrorState = false;
			var goToState = null;
			function nextStep () {
				if (goToState !== null && !isInErrorState) { 
					setPlugState(processArguments.config.ip, goToState, function () {
						console.log("Successfully updated device state to", goToState);
						
						curVal = goToState? 100 : 0;
						goToState = null;
						
						setTimeout(nextStep, processArguments.config.timeout);
					});
				}
				else {
					getPlugState(processArguments.config.ip, function (err, state) {
						if (err) {
							if (!isInErrorState) {
								console.log("Cant communicate with:", processArguments.config.ip);
							}
							isInErrorState = true;
							
							setTimeout(nextStep, processArguments.config.timeout);
						}
						else {
							if (isInErrorState) {
								isInErrorState = false;
								
								console.log("Communication success");
							}
							
							if (curVal !== state) {
								curVal = state;
								
								requestApi("deviceValue", "POST", {
									id: id,
									value: curVal? 100 : 0
								}, function () {
									setTimeout(nextStep, processArguments.config.timeout);
								});
							}
							else {
								setTimeout(nextStep, processArguments.config.timeout);
							}
						}
					});
				}
			};

			nextStep();
			
			onDeviceChange(id, function (deviceData) {
				var newVal = deviceData.value === 100;
				if (newVal !== curVal) {
					goToState = newVal;
				}
			});
		});
	}
});








/**
FUNCTIONS
**/

var net = require('net');
var encrypt = require('tplink-smarthome-crypto');

function getPlugState (ip, callBack) {	
	var socket = net.connect("9999", ip);
	socket.setKeepAlive(false);
	socket.setTimeout(1000);

	socket.on('connect', function () {
		socket.write(encrypt.encryptWithHeader('{"system":{"get_sysinfo":{}}}'), function() { });
	});

	socket.on('timeout', function () {
		socket.end();
	});
	
	socket.on('error', function (e) {
		callBack(e);
	});
	
	socket.on('end', function () {
		socket.end();
	});

	socket.on('data', function (data) {
		var jsonString = encrypt.decrypt(data.slice(4)).toString('ascii');
		var jsonData = false;
		try {
			jsonData = JSON.parse(jsonString);
		}
		catch (e) {
			console.log(e);
		}
		
		if (jsonData !== false) {
			callBack(null, jsonData.system.get_sysinfo.relay_state === 1);
		}
	});
};

function setPlugState (ip, state, callBack) {
	var socket = net.connect("9999", ip);
	socket.setKeepAlive(false);
	socket.setTimeout(1000);

	socket.on('connect', function () {
		socket.write(encrypt.encryptWithHeader('{"system":{"set_relay_state":{"state":' + (state? 1 : 0) + '}}}'), function  () { });
	});

	socket.on('timeout', function () {
		socket.end();
	});
	
	socket.on('end', function () {
		socket.end();
	});

	socket.on('error', function () {
		callBack(state);
	});
	
	socket.on('data', function (data) {
		callBack(state);
	});
};