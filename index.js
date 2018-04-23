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
var homeUiApi = require("../../frontend/mainApi.js");
 

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




homeUiApi.requestApi("device", "POST", {
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
		homeUiApi.requestApi("deviceValue/" + id, "GET", {}, function (err, curVal) {
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
								
								homeUiApi.requestApi("deviceValue", "POST", {
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
			
			homeUiApi.onDeviceChange(id, function (deviceData) {
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