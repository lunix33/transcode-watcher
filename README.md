= Transcode Watcher

This project was created to make transcoding video files faster and easier.
Note:
	In this guide, these tags will be used:
		* `<PT:X>`: *Path to application X* (Use `which X` to know the path).
		* `<PTR>`: *Path to git repository*
		* `<PTH>`: *Path to home directory*

== 1. Requirement

* Node JS
* HandBrakeCLI
* Linux
	If I receive enough request (or if someone submit a pull request) I could try to make it compatible with Windows.

== 2. How to install

Before starting be sure all the requirement are fulfilled.
1. Clone the repository.
2. Within a terminal, navigate to the root of the repository and run `npm install`.
3. Set your configuration. (see section 3)

== 3. Configuration

To setup a user specific configuration, copy the `config.json` as follow `<PTH>/.config/transcodewatcher.json`.
This file will override the default configuration present in config.json.

Here is the list of the configuration options.

**input_path**:
	The path to listen for input files.
	note: This parameter is required!
**input_file**:
	The list of extension to catch.
	default: Listen for m4v, mp4 and mkv video files.
**output_path**:
	Path where the final video file is to be outputed.
	note: This parameter is required!
**move_path**:
	Path where the original video file is moved for safe keeping.
	default: Delete on completion.
**log_output**:
	Path to the service log file.
	default: Under the `logs` directory, in script directory, in `activity.log.DATE` file. ('./logs/activity.log.DATE')
	note: The date is added at the end of the file name.
**handbrake_log**:
	Path to the directory with handbrake logs.
	default: No handbrake log.
	note: One log file per transcoding task will be created.
**progress_output**:
	Path where to output current progression.
	default: No transcode progress output.
**loop_timeout**:
	The intervale at which the input folder will be scanned. (in ms)
	default: Every 15 minutes.
**change_timeout**:
	The intervale at which the file size will be recheck for change. (in ms)
	default: After 15 seconds.
**concurrent**:
	The number of concurrent task running.
	default: 1 task
**handbrake_cli**:
	The path to the HandBrakeCLI bin.
	default: /usr/bin/HandBrakeCLI
**transcoding**:
	The Handbrake transcoding parameters.
	default: Use h265 encoder on medium preset with quality 20. Copy all audio and subtitles.
	note: See `https://handbrake.fr/docs/en/latest/cli/cli-guide.html`; the input and output parameters must be present.

== 4. How to run

To run this node script, simply run from within the git repository:

```
node main.js [arguments]
```

Optional arguments can be added (see 4.2).

=== 4.1 Run on startup.

If you want to run the service as soon as the computer is booting and if you're using a Linux distribution using systemd, you can use the `systemd.service` to run the service as a Linux service.
Simply copy the file into `/etc/systemd/system` and edit it to be sure the file correctly refect your setup.

exemple:

```
(Original)
6 ExecStart=<PT:node> <PTR>/main.js
--- --- ---
(Modified)
6 ExecStart=/usr/bin/node home/user/transcode-watcher/main.js
```

While using this setup, the service will run as `root`, so be sure to put your configuration file at the right place (`/root/.config/`).

if your distribution dosen't use systemd, you could add your run comment into your crontab.
And to have a better control over your cronjob, it might be intresting to run it in screen.

exemples:

```
@reboot <PT:node> <PTR>/main.js
--- --- ---
@reboot <PT:screen> -dmS TranscodeWatcher <PT:node> <PTR>/main.js
```

=== 4.2 Arguments

**-c**: 
	The path to a non-standard configuration file.
	*note: tilde (~) can be use to refer to the current user home directory.*
