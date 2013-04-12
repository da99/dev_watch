#!/usr/bin/env node

var fs = require('fs');
var _  = require('underscore');

var last_change = 0;
var changes     = {};
var dirs        = [];
var watched     = [];
var on_exits    = [];
var wait_msg_shown = false;

var ons = [ ];

var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

function inform(msg) {
  console['log']("==== " + msg);
}

function is_running() { return river.ops.length > 0; }

var river = {
  ops: [],
  push: function (func) {
    river.ops.push(func);
  },
  start: function () {
    river.next();
  },
  next: function () {
    if (!river.ops.length)
      return;
    river.ops.shift()();
  },
  fin: function () {
    river.next();
  },
  err: function (msg) {
    river.ops = [];
  }
};


function watch(str_or_list, func) {
  dirs.push(str_or_list);
  dirs = _.uniq(_.flatten(dirs));
  ons.push([str_or_list, func]);
  _.each(dirs, function (name) {
    if (_.contains(watched, name))
      return false;
    fs.watch(name, function (event, file_name) { files_changed(name, file_name); });
    watched.push(name);
  });
}

function files_changed(dir, file_name) {
  if (is_running()) {
    if (dir || file_name) {
      if (!wait_msg_shown) {
        inform("Still waiting for other funcs to finish.");
        wait_msg_shown = true;
      }
    }
    return;
  }

  if (dir || file_name) {
    changes[dir] = file_name;
    last_change = (new Date).getTime();
    return files_changed();
  }

  var too_early = ((new Date).getTime() - last_change) < 99;
  if (too_early)
    return setTimeout(files_changed, 100);

  for (var dir in changes) {
    for (var i in ons) {
      var pair    = ons[i];
      var pattern = pair[0];
      var func    = pair[1];
      if (dir === pattern || (_.isArray(pattern) && _.contains(pattern, dir))) {

        river.push((function (file, on_change) {
          return function () { on_change(file, river); };
        })(dir + '/' + changes[dir], func))

      }
    }
    delete changes[dir];
  }

  river.start();
}

function print_stdio(so, se) {
  if ( !so ) so = '';
  if ( !se ) se = '';

  if (so.length)
    process.stdout.write();
  if (se.length) {
    inform("stderr: ===");
    process.stdout.write(se);
  }
}

function shell(cmd, func) {
  exec(cmd, function (err, so, se) {
    print_stdio(so, se);
    if (err) {
      inform("Stopping funcs in queue because: " + err);
      return river.ops = [];
    }
    func();
  });
}

function on_exit(func) {
  on_exits.push(func);
}

function shutdown() {
  _.each(on_exits, function (f) {
    f();
  });
}

process.on('SIGINT', shutdown);

// ****************************************************************
// ****************** Exports: ************************************
// ****************************************************************

exports.shell       = shell;
exports.watch       = watch;
exports.on_exit     = on_exit;
exports.print_stdio = print_stdio;
exports.watched     = [];



