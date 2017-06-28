#!/usr/bin/env node
/* global __dirname */

const glob = require('glob');
const minimist = require('minimist');
const path = require('path');
const process = require('process');
const cprocess = require('child_process');
const fs = require('fs');

const EOL = require('os').EOL;
const HOME = require('os').homedir();

/** @type srvconfig */
var conf = null;
/** @type number */
var log_descriptor = null;
/** @type number */
var running = 0;
/** @type string[] */
var files = [];

/**
 * Log fatal exception.
 * @param {object} err The exception.
 * @returns {undefined} 
 */
process.on('uncaughtException', (err) => {
	log(`Unexpected error.${EOL}` +
			`Message: ${err.message}${EOL}` +
			`Stack: ${EOL}${err.stack}`);
	log('Service terminated.');
	process.exit(1);
});

/**
 * Simply end the log file.
 */
process.on('SIGINT', () => {
	log('Service terminated.');
	fs.closeSync(log_descriptor);
	process.exit(0);
});

/**
 * Main entry point.
 * @param {srvargs} args The service arguments.
 * @returns {undefined}
 */
function main(args) {
	process.chdir(__dirname);
	
	// Screen log delimiter
	let time = (new Date()).toLocaleString();
	log(`---- ---> ${time} <--- -----`);

	// Load configuration.
	conf = loadConfig(args.c);
	
	// Open log file.
	try {
		if (conf.log_output) {
			log('Opening log file...');
			let date = new Date();
			let dateappend = `${
				date.getFullYear()}-${date.getMonth()}-${date.getDate()}.${
				date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
			log_descriptor = fs.openSync(`${conf.log_output}.${dateappend}`, 'w');
		} else
			log('Screen log only.');
	}
	
	// Catch log file opening error.
	catch (err) {
		if (args.f) {
			log_descriptor = null;
			log('Failed to open log file, continue with screen log only.');
		}
		
		// Rethrow the error for execution error logging.
		else
			throw err;
	}
	
	// Run
	log("Service ready...");
	
    loop();
}

/**
 * Load the configuration file.
 * @param {string} location The location of the config file.
 * @returns {srvconfig} The configuration object.
 */
function loadConfig(location) {
	// Define configuration possible paths.
	let home = path.join(HOME, '.config', 'transcodewatcher.json'); // User's configuration file.
	let def = './config'; // Default configuration.
	
	// Select location path based on availability.
	location = (location) ? location.replace('~', HOME) :
			(fs.existsSync(home)) ? home :
			null;
			
	// Load config file.
	log(`Default configuration: ${def}`);
	let conf = require(def);
	log(`Custom configuration: ${location}`);
	let userConf = (location) ? require(location) : {};
	
	// Merging configurations.
	for (let i in userConf)
		conf[i] = userConf[i];
	
	return Object.freeze(conf);
}

/**
 * Application loop.
 * @returns {undefined}
 */
function loop() {
	// No file in queue, find new files.
	if (files.length === 0 && running === 0) {
		glob(`${conf.input_path}/**/*.{${conf.input_file}}`, (err, matches) => {
			files = matches;
			if (files.length > 0) {
				// Verify if the file is in transfert
				// TODO: I think `mtime` could be used instead of `blocks` to make this utility usable on Windows.
				const sizes = files.map((x) => fs.statSync(x).blocks);
				setTimeout(() => {
					const sizesReview = files.map((x) => fs.statSync(x).blocks);
					
					// Remove currently transfering file from queue.
					for (let i = sizesReview.length - 1; i >= 0; i--) {
						const original = sizes[i];
						const review = sizesReview[i];
						
						if (original !== review) {
							log(`Skipping ${path.basename(files[i])} (size changed).`);
							files.splice(i, 1);
						}	
					}
					
					// Run transcode.
					for (let i = 0; i < conf.concurrent; i++) {
						if (files.length > 0) {
							++running;
							setTimeout(exec, 0, files.pop());
						}
					}
				}, conf.change_timeout);
			}
			
			// No new files, wait.
			else {
				log('No change, Waiting...');
				setTimeout(loop, conf.loop_timeout);
			}
		});
	}
	
	// Queue not empty, continue
	else {
		exec(files.pop());
	}
}

/**
 * Run transcoding task on file.
 * @param {string} file The path to the file.
 * @returns {undefined}
 */
function exec(file) {
	log(`Encoding: ${path.basename(file)} ...`);
	
	// Move the file to the validation folder.
	const filename = path.basename(file);
	const dir = path.dirname(file);
	const move = (conf.move_path) ? path.join(conf.move_path, filename) : null;
	
	// Run handbrake
	const hblog = (conf.handbrake_log) ?
		fs.openSync(path.join(conf.handbrake_log, `${filename}.log`), 'w') : null;
	
	const output = path.join(conf.output_path, filename);
	const args = [
		'--input', file,                  // input
		'--output', output,               // output
		...conf.transcoding
	];
	
	const child = cprocess.spawn(conf.handbrake_cli, args);
	
	// Write progress to progress file.
	child.stdout.on('data', (data) => {
		if (conf.progress_output)
			fs.writeFileSync(
				conf.progress_output,
				`File: ${output}${EOL}${data.toString().replace('\r', '')}`);
	});
	
	// Write details + log to log file.
	child.stderr.on('data', (data) => {
		if (hblog)
			fs.writeSync(hblog, data.toString().replace('\r', EOL));
	});
	
	// Clean, close logs and continue.
	child.on('close', (code) => {
		// Closing handbrake logs.
		if (hblog) {
			fs.writeSync(hblog, `Finished with error code: ${code}`);
			fs.closeSync(hblog);
		}
		
		// Remove progress file.
		if (conf.progress_output)
			fs.unlinkSync(conf.progress_output);
		
		// Moving/Deleting file.
		if (move)
			fs.renameSync(file, move);
		else {
			if (dir === conf.input_path)
				fs.unlinkSync(file);
		}
		
		// Delete transcoding sub directory.
		if (dir !== conf.input_path)
			fs.rmdirSync(dir);
		
		// Next file or return to loop.
		log(`${filename} Done. (code: ${code})`);
		if (files.length > 0)
			exec(files.pop());
		else {
			--running;
			if (running === 0)
				loop();
		}
	});
}

/**
 * Log a message.
 * Always write to screen, but if a log file is open, it will also write to it.
 * @param {string} message The message to write.
 * @returns {undefined}
 */
function log(message) {
	message = `${(new Date()).toLocaleString()} > ${message}`;
	console.log(message);
	if (log_descriptor)
		fs.writeSync(log_descriptor, message + EOL);
}

main(minimist(process.argv.slice(2)));

/**
 * Service configuration.
 * @typedef {object} srvconfig The configuration of the sercice.
 * @property {string} input_path
 *		The path to listen for input files.
 *		note: This parameter is required!
 * @property {string[]}  [input_file=["m4v", "mp4", "mkv"]]
 *		The list of extension to catch.
 *		default: Listen for m4v, mp4 and mkv video files.
 * @property {string} output_path
 *		Path where the final video file is to be outputed.
 *		note: This parameter is required!
 * @property {string} [move_path=""]
 *		Path where the original video file is moved for safe keeping.
 *		default: Delete on completion.
 * @property {string} [log_output="./logs/activity.log"]
 *		Path to the service log file.
 *		default: Use `activity.log.DATE` file in script directory (`./activity.log.DATE`).
 *		note: The date is added at the end of the file name.
 * @property {string} [handbrake_log=""]
 *		Path to the directory with handbrake logs.
 *		default: No handbrake log.
 *		note: One log file per transcoding task will be created.
 * @property {string} [progress_output=""]
 *		Path where to output current progression.
 *		default: No transcode progress output.
 * @property {number} [loop_timeout=900000]
 *		The intervale at which the input folder will be scanned. (in ms)
 *		default: Every 15 minutes.
 * @property {number} [change_timeout=15000]
 *		The intervale at which the file size will be recheck for change. (in ms)
 *		default: After 15 seconds.
 * @property {number} [concurrent=1]
 *		The number of concurrent task running.
 *		default: 1 task
 * @property {string} [handbrake_cli="/usr/bin/HandBrakeCLI"]
 *		The path to the HandBrakeCLI bin.
 *		default: /usr/bin/HandBrakeCLI
 * @property {string[]}  transcoding
 *		The Handbrake transcoding parameters.
 *		default: Use h265 encoder on medium preset with quality 20. Copy all audio and subtitles.
 *		note: see https://handbrake.fr/docs/en/latest/cli/cli-guide.html; The input and output parameters must not be present.
 */

/**
 * Service arguments
 * @typedef {object} srvargs The arguments of the service.
 * @property {string} [c]
 *		The path to a non-standard configuration file.
 *		note: tilde (~) can be use to refer to the current user home directory.
 * @property {boolean} [f]
 *		If the log file is enable but fail to open, the service will continue with only the screen log.
 */
