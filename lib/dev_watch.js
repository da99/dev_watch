#!/usr/bin/env node

var fs   = require('fs');
var path = require('path');
var _    = require('underscore');

var last_change = 0;
var changes     = {};
var dirs        = [];
var watched     = [];
var wait_msg_shown = false;

var ons = [ ];

var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

function inform(msg) {
  console['log']("==== " + msg);
}

function warn(msg) {
  console['log']("warning: ==== " + msg);
}

function is_waiting_for_ons_to_finish() { return river.ops.length > 0; }

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
    fs.watch(name, function (event, file_name) { files_changed(name, file_name, event); });
    watched.push(name);
    exec("find " + name + " -mindepth 1 -type d ", function (err, o, e) {
      if (err) {
        warn(err.message);
        return;
      }

      if (e)
        warn(e)

      o = (o + '').trim();
      if (!o.length)
        return;
      watch(o.split("\n"), func);
    });
  });
}

function ons_funcs_for(dir) {
  var funcs = [];

  _.each(ons, function (pair) {
    var str_or_list = pair[0];
    var func = pair[1];
    var dirs = _.flatten([str_or_list]);
    if (_.contains(dirs, dir))
      funcs.push(func);
  });

  return funcs;
}


function files_changed(dir, file_name, event) {

  // if folder has been created:
  if (event && event === 'rename') {
    var fpath = path.join(dir, file_name);
    if (fs.existsSync(fpath)) {
      var stat  = fs.statSync(fpath);
      if(stat.isDirectory()) {
        _.each(ons_funcs_for(dir), function (func) {
          watch(fpath, func);
        });
        return;
      }
    }
  }

  if (is_waiting_for_ons_to_finish()) {
    if (dir || file_name) {
      if (!wait_msg_shown) {
        inform("Still waiting for other funcs to finish.");
        wait_msg_shown = true;
      }
    }
    return;
  }

  if (dir || file_name) {
    changes[dir] = {file_name: file_name, event: event};
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

        river.push((function (file, on_change, event) {
          return function () { on_change(file, river, event); };
        })(dir + '/' + changes[dir].file_name, func, changes[dir].event))

      }
    }
    delete changes[dir];
  }

  river.start();
}

function print_stdio(so, se) {
  if (so)
    process.stdout.write(so);
  if (se) {
    inform("stderr: ===");
    process.stdout.write(se);
  }
}

function shell(cmd, func) {
  exec(cmd, function (err, so, se) {
    print_stdio(so, se);
    if (err) {
      if (se)
        inform("Stopping funcs in queue.");
      else
        inform("Stopping funcs in queue because: " + err);
      return river.ops = [];
    }
    func();
  });
}

// ****************************************************************
// ****************** Exports: ************************************
// ****************************************************************

exports.shell       = shell;
exports.dir         = watch;
exports.print_stdio = print_stdio;
exports.dirs        = watched;



