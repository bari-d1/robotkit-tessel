var tessel = require('tessel');
var servolib = require('servo-pca9685');
var http = require('http');
var fs = require('fs');
var socketIo = require('socket.io');

var servo = servolib.use(tessel.port['A']);

var MOTOR1 = 1;
var MOTOR2 = 3;
var MOTOR3 = 5;
var MOTOR4 = 7;
var MOTOR5 = 9;

var DIRECTION_NONE = -1;
var DIRECTION_FORWARD = 0;
var DIRECTION_BACKWARD = 1;

var motorStates = {};
motorStates[MOTOR1] = DIRECTION_NONE;
motorStates[MOTOR2] = DIRECTION_NONE;
motorStates[MOTOR3] = DIRECTION_NONE;
motorStates[MOTOR4] = DIRECTION_NONE;
motorStates[MOTOR5] = DIRECTION_NONE;

var fs = require('fs');
var socketIo = require('socket.io');

var server = http.createServer(function (request, response) {
    response.writeHead(200, {"Content-Type": "text/html"});

    // Use fs to read in index.html
    fs.readFile(__dirname + '/index.html', function (err, content) {
        // If there was an error, throw to stop code execution
        if (err) { throw err; }

        // Serve the content of index.html read in by fs.readFile
        response.end(content);
    });
});

var io = socketIo(server);

io.on('connection', function(socket){
    socket.on('setMotorStateForTime', setMotorStateForTime);
    socket.on('setMotorState', setMotorState);
    socket.on('stopMotor', stopMotor)
});
server.listen(80);

/**
 * Return address of registers and value for set motor state
 *
 * @param pinIndex Pin index 1-10 (we have only 5 motors)
 * @param value Value to set
 * @return array
 */
function getChainValues(pinIndex, value) {
    // pca9685 registers
    var LED0_ON_L = 0x06;
    var LED0_ON_H = 0x07;
    var LED0_OFF_L = 0x08;
    var LED0_OFF_H = 0x09;

    // values
    var convertOn = 0;
    var convertOff = value;

    var index = (pinIndex - 1) * 4;
    var chain = [
        LED0_ON_L + index, LED0_ON_H + index,
        LED0_OFF_L + index, LED0_OFF_H + index
    ];
    var values = [
        convertOn, convertOn >> 8,
        convertOff, convertOff >> 8
    ];
    return [chain, values];
}

/**
 * Return signals for setting motor state
 * @param motorIndex Motor index
 * @param direction Direction of rotate (DIRECTION_NONE, DIRECTION_FORWARD, DIRECTION_BACKWARD)
 * @returns {*[]}
 */
function getMotorState(motorIndex, direction, value) {
    var MAX = 4096;
    var chain = [], values = [];

    value = value || MAX / 2;

    var forwardIndex = motorIndex;
    var backwardIndex = motorIndex + 1;
    var chain1, chain2;

    if (direction == DIRECTION_NONE) {
        // stop all motors
        chain1 = getChainValues(forwardIndex, 0);
        chain2 = getChainValues(backwardIndex, 0);
    } else if (direction == DIRECTION_FORWARD) {
        // stop backward and start forward
        chain1 = getChainValues(backwardIndex, 0);
        chain2 = getChainValues(forwardIndex, value);
    } else if (direction == DIRECTION_BACKWARD) {
        // stop forward and start backward
        chain1 = getChainValues(forwardIndex, 0);
        chain2 = getChainValues(backwardIndex, value);
    }

    chain = chain.concat(chain1[0]);
    values = values.concat(chain1[1]);

    chain = chain.concat(chain2[0]);
    values = values.concat(chain2[1]);

    return [chain, values];
}

/**
 * Write states of all motors into controller
 * @param states
 */
function writeValues(states, value, callback) {
    callback = callback || function() {};
    var chain = [], values = [];
    for (var motorIndex in states) {
        if (!states.hasOwnProperty(motorIndex)) {
            return;
        }

        var chains = getMotorState(parseInt(motorIndex), states[motorIndex], value);

        chain = chain.concat(chains[0]);
        values = values.concat(chains[1]);
    }
    servo._chainWrite(chain, values, callback);
}

/**
 * Change motor state
 *
 * @param motorIndex Motor index (1-5)
 * @param direction Direction of rotate (DIRECTION_NONE, DIRECTION_FORWARD, DIRECTION_BACKWARD)
 */
function setMotorState(motorIndex, direction, callback, value) {
    console.info('setMotorState', motorIndex, direction, value);
    motorStates[motorIndex] = direction;
    writeValues(motorStates, parseInt(value), callback);
}

/**
 * Change motor state and wait some time
 *
 * @param motorIndex Motor index (1-5)
 * @param direction Direction of rotate (DIRECTION_NONE, DIRECTION_FORWARD, DIRECTION_BACKWARD)
 * @param time Time to wait
 * @returns {Promise}
 */
function setMotorStateForTime(motorIndex, direction, time, value) {
    console.info('setMotorStateForTime', motorIndex, direction, time);
    return new Promise(function (resolve) {
        setMotorState(motorIndex, direction, function() {
            setTimeout(function() {
                io.emit('setMotorStateForTimeStops');
                stopMotor(motorIndex);
                resolve();
            }, time);
        }, value);
    });
}

function stopMotor(index) {
    console.info('stopMotor', index);
    motorStates[index] = DIRECTION_NONE;
    writeValues(motorStates);
}

servo.on('ready', function () {
    servo.setModuleFrequency(3);
});