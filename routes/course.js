var mdb = require('../mdb'),
    remember = require('../remember'),
    async = require('async'),
    extname = require('path').extname,
    winston = require('winston');

exports.index = function(req, res) {
    remember(req);
    mdb.Course.find({}, function (err, courses) {
	res.render('course/index', { courses: courses });
    });
}

exports.landing = function(req, res) {
    remember(req);

    var slug = req.params[0];

    mdb.Course.findOne({slug: slug}).exec( function (err, course) {
	if (course) {
	    mdb.GitRepo.findOne({_id: course.repo}).exec( function (err, repo) {
		if (repo) {
		    res.render('course/landing', { course: course, repo: repo });
		} else {
		    res.send("Repo not found.");
		}
	    });
	} else {
	    res.send("Course not found.");
	}
    });
}

function findMostRecentBranch(owner, repository, branchName, callback) {
    mdb.Branch.find({owner: owner, repository: repository, name: branchName}).sort({lastUpdate: -1}).limit(1).exec( function (err, branches) {
	var branch = branches[0];
	callback( err, branch );
    });
}

function findMostRecentGitFileContents( owner, repository, branchName, path, callback) {
    var commit;
    var hash;    
    
    async.waterfall(
	[
	    function( callback ) {
		findMostRecentBranch( owner, repository, branchName, callback );
	    },
	    
	    function( branch, callback ) {
		if (!branch)
		    callback( "Missing branch", null );
		else {
		    commit = branch.commit;
		    mdb.GitFile.findOne({commit: branch.commit, path: path}).exec(callback);
		}
	    },
	    
	    function( gitFile, callback ) {
		if (!gitFile)
		    callback( "Missing gitFile", null );
		else {
		    hash = gitFile.hash;
		    console.log( hash );
		    mdb.Blob.findOne({hash: gitFile.hash}).exec(callback);
		}
	    },
	    
	], function(err, result) {
	    if ((!err) && result) {
		result.commit = commit;
		result.path = path;
		result.owner = owner;
		result.hash = hash;
		result.repository = repository;
	    }
	    
	    callback(err, result);
	});
}

function regexpForParentDirectories( path, extension ) {
    var parts = path.split('/');
    var re = (parts.join('(\/')) + ((new Array(parts.length)).join(')?'));
    re = '^(' + re + '\/)?\/?[^/]*\.' + extension + '$';
    return new RegExp(re);
}

/** Search owner/repository/branchName for all files matching
 * extension in the directory path and all any parent directories */
function findParentDirectoryFileContents( owner, repository, branchName, path, extension, callback) {
    var commit;
    var hash;    
    
    async.waterfall(
	[
	    function( callback ) {
		findMostRecentBranch( owner, repository, branchName, callback );
	    },
	    
	    function( branch, callback ) {
		if (!branch)
		    callback( "Missing branch", null );
		else {
		    commit = branch.commit;
		    var re = regexpForParentDirectories( path, extension );
		    mdb.GitFile.find({commit: branch.commit, path: {$regex: re}}).exec(callback);
		}
	    },
	    
	    function( gitFiles, callback ) {
		if (!gitFiles)
		    callback( "Missing gitFile", null );
		else {
		    mdb.Blob.find({hash: { $in: gitFiles.map( function(x) { return x.hash; } ) }}).exec(callback);
		}
	    },
	    
	], function(err, result) {
	    if ((!err) && result) {
		result.commit = commit;
		result.path = path;
		result.owner = owner;
		result.hash = hash;
		result.repository = repository;
	    }
	    
	    callback(err, result);
	});
}


function findCourseAndActivityBySlugs(user, courseSlug, activitySlug, callback) {
    var locals = {course: null, activity: null};
    async.series([
        function (callback) {
            mdb.Course.findOne({slug: courseSlug}).exec(function(err, course) {
                locals.course = course;
                callback();
            });
        },
        function (callback) {
            // Get activities for slug with most recent first.
	    mdb.Activity.find({slug: activitySlug}).sort({timeLastUsed: -1}).exec( function (err, activities) {
                locals.activities = activities;
                callback();
            });
        },
        function (callback) {
            // Find most recent activity version for which this user has scope.
            if (locals.activities) {
                async.eachSeries(locals.activities, function (activity, callback) {
                    if (!locals.activity) {
                        mdb.Scope.findOne({activity: activity._id, user: user._id}, function (err, scope) {
                            if (scope) {
                                locals.activity = activity;
                            }
                            callback();
                        });
                    }
                    else {
                        callback();
                    }
                }, callback);
            }
            else {
                callback();
            }
        },
        function (callback) {
            // If no scope for any version, default to most recent.
            if (!locals.activity && locals.activities.length > 0) {
                locals.activity = locals.activities[0];
            }
            callback();
        }

    ],
    function () {
        callback(locals.course, locals.activity);
    });
}

function getActivityHtml(activity, callback) {
    var accum = "";
    var readStream = mdb.gfs.createReadStream({_id: activity.htmlFile});
    readStream.on('data', function (data) {
	accum += data;
    });
    readStream.on('end', function () {
        callback(accum);
    });
}

// Update to most recent version of activity.
exports.activityUpdate = function(req, res) {
    var courseSlug = req.params[0];
    var activitySlug = req.params[1];

    if (!activitySlug.match( ':' )) {
	var repo = courseSlug.split('/').slice(0,2).join( '/' )
	activitySlug = repo + ':' + activitySlug;
    }

    var locals = {};

    async.series([
        function (callback) {
            mdb.Activity.findOne({recent: true, slug: activitySlug}, function (err, activity) {
                locals.activity = activity;
                callback();
            });
        },
        function (callback) {
            if (locals.activity) {
                mdb.Scope.findOne({activity: locals.activity._id, user: req.user}, function (err, scope) {
                    if (!scope) {
                        // Need to create new scope for most recent version.
                        var newScope = new mdb.Scope({activity: locals.activity._id, user: req.user._id, dataByUuid: null});
                        newScope.save(callback);
                    }
                    else {
                        callback();
                    }
                });
            }
            else {
                res.status(500).send("Could not find activity.");
                callback("Could not find activity.");
            }
        },
        function (callback) {
            res.redirect('..');
            callback();
        }]);
}

exports.activity = function(req, res) {
    remember(req);

    var courseSlug = req.params[0];
    var activitySlug = req.params[1];

    if (!activitySlug.match( ':' )) {
	var repo = courseSlug.split('/').slice(0,2).join( '/' )
	activitySlug = repo + ':' + activitySlug;
    }

    var locals = {};

    async.series([
        function (callback) {
            findCourseAndActivityBySlugs(req.user, courseSlug, activitySlug, function (course, activity) {
                locals.course = course;
                locals.activity = activity;
                if (!course) {
                    callback("Course not found.");
                }
                else if (!activity) {
                    callback("Activity not found.");
                }
                else {
                    callback();
                }
            });
        },
        function (callback) {
            getActivityHtml(locals.activity, function(html) {
                locals.activityHtml = html;
                if (!html) {
                    res.send('Error reading activity.');
                }
                else {
                    callback();
                }
            });
        },
        function (callback) {
	    //var parentActivity = locals.course.activityParent(locals.activity);
	    var nextActivity = locals.course.nextActivity(locals.activity);
	    var previousActivity = locals.course.previousActivity(locals.activity);
	    res.render('course/activity',
		       { activity: locals.activity, activityHtml: locals.activityHtml,
			 course: locals.course,
			 nextActivity: nextActivity, previousActivity: previousActivity,
			 activityId: locals.activity._id.toString()
		       });
        }
    ],
    function (err) {
        if (err) {
            res.send(err);
        }
    });
};

exports.activitySource = function(req, res) {
    remember(req);

    var courseSlug = req.params[0];
    var activitySlug = req.params[1];

    if (!activitySlug.match( ':' )) {
	var repo = courseSlug.split('/').slice(0,2).join( '/' )
	activitySlug = repo + ':' + activitySlug;
    }

    var locals = {};

    async.series([
        function (callback) {
            findCourseAndActivityBySlugs(req.user, courseSlug, activitySlug, function (course, activity) {
                locals.course = course;
                locals.activity = activity;
                if (!course) {
                    res.send("Course not found.");
                }
                if (!activity) {
                    res.send("Activity not found.");
                }
                callback();
            });
        },
        function (callback) {
            getActivityHtml(locals.activity, function(html) {
                locals.activityHtml = html;
                if (!html) {
                    res.send('Error reading activity.');
                }
                callback();
            });
        },
        function (callback) {
            res.render('activity-source', { activity: locals.activity, activityId: locals.activity._id });
        }
    ]);
};


exports.source = function(req, res) {
    remember(req);

    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;
    var path = req.params.path;
    
    findMostRecentGitFileContents( owner, repository, branchName, path, function(err, file) {
	if (err)
	    res.send( err );
	else {
	    mdb.CompileLog.findOne({hash: file.hash, commit: file.commit}, function(err, compileLog) {
		res.render('source', { file: file, compileLog: compileLog });
	    });
	}
    });
};

exports.stylesheet = function(req, res) {
    remember(req);

    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;
    var path = req.params.path.replace( /\.css$/, '' );

    findParentDirectoryFileContents( owner, repository, branchName, path, "css", function(err, files) {
	if (err)
	    res.send( err );
	else {
	    res.contentType( 'text/css' );
	    var output = Buffer.concat( files.map( function(f) { return f.data; } ) );
	    res.end( output, 'binary' );
	}
    });
};

exports.javascript = function(req, res) {
    remember(req);

    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;
    var path = req.params.path;

    findMostRecentGitFileContents( owner, repository, branchName, path, function(err, file) {    
	if (err)
	    res.send( err );
	else {
	    res.contentType( 'text/javascript' );
	    res.end( file.data, 'binary' );
	}
    });
};


exports.image = function(req, res) {
    remember(req);

    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;
    var path = req.params.path;
    
    findMostRecentGitFileContents( owner, repository, branchName, path, function(err, file) {
	if (err)
	    res.send( err );
	else {
	    // SVG files will only be rendered if they are sent with content type image/svg+xml
	    if (extname(path) == ".svg")
		res.contentType( 'image/svg+xml' );
	    else if (extname(path) == ".jpg")
		res.contentType( 'image/jpeg' );
	    else
		res.contentType( 'image/' + extname(path).replace('.', '') );
	    
	    res.end( file.data, 'binary' );
	}
    });
};

exports.activity = function(req, res) {
    remember(req);

    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;
    var path = req.params.path;
    var commit;
    var hash;
    var activity;
    
    async.waterfall(
	[
	    // BADBAD: this will eventually need to look for the most recent SCOPE first instead of just the branch
	    function( callback ) {
		findMostRecentBranch( owner, repository, branchName, callback );
	    },

	    // Get the activity data
	    function( branch, callback ) {
		if (!branch)
		    callback( "Missing branch", null );
		else {
		    commit = branch.commit;
		    mdb.Activity.findOne({commit: branch.commit, path: path}).exec(callback);
		}
	    },

	    // Get the HTML content
	    function( anActivity, callback ) {
		if (!anActivity)
		    callback( "Missing activity", null );
		else {
		    activity = anActivity;
		    console.log( activity );
		    hash = activity.hash;
		    mdb.Blob.findOne({hash: hash}).exec(callback);
		}
	    },

	    // Attach HTML and previous data to the activity
	    function( result, callback ) {
		if (result) {
		    activity.html = result.data;	    
		}

		activity.repositoryName = repository;
		activity.ownerName = owner;

		callback( null, commit );
	    },	    	    

	    // Get the xourse
	    function( commit, callback ) {
		if (!commit)
		    callback( "Missing xourse", null );
		else {
		    mdb.Xourse.findOne({commit: commit}).exec(callback);
		}
	    },

	    // Attach the xourse to the activity
	    function( result, callback ) {
		if (result) {
		    activity.xourse = result;
		}

		callback(null);
	    },
	    
	], function(err, result) {
	    if ((err == "Missing branch") && (branchName != "master")) {
		res.redirect("/course/" + owner + "/" + repository + "/master/" + branchName + "/" + path);
	    } else {
		if (err) {
		    res.send( err );
		} else {
		    activity.branchName = branchName;
		    activity.path = path;

		    var stylesheet = '/course/' + owner + '/' + repository + '/' + branchName + '/' + path + '.css';
		    var javascript = '/course/' + owner + '/' + repository + '/' + branchName + '/' + path + '.js';
		    res.render('activity', { activity: activity, stylesheet: stylesheet, javascript: javascript });
		}
	    }
	});
};

exports.tableOfContents = function(req, res) {
    remember(req);
    
    var owner = req.params.username;
    var repository = req.params.repository;
    var branchName = req.params.branch;

    if (branchName === undefined)
	branchName = 'master';

    var commit;
    var hash;
    var xourse;    
    
    async.waterfall(
	[
	    function( callback ) {
		findMostRecentBranch( owner, repository, branchName, callback );
	    },
	    
	    function( branch, callback ) {
		if (!branch)
		    callback( "Missing branch", null );
		else {
		    commit = branch.commit;
		    mdb.Xourse.findOne({commit: branch.commit}).exec(callback);
		}
	    },
	    
	    function( aXourse, callback ) {
		if (!aXourse)
		    callback( "Missing Xourse", null );
		else {
		    xourse = aXourse;
		    console.log( xourse );
		    hash = xourse.hash;
		    mdb.Blob.findOne({hash: hash}).exec(callback);
		}
	    },
	    
	], function(err, result) {
	    if ((err == "Missing branch") && (branchName != "master")) {
		res.redirect("/course/" + owner + "/" + repository + "/master/" + branchName + "/");
	    } else {
		if ((err) || (!result)) {
		    res.send( err );
		} else {
		    result.commit = commit;
		    result.owner = owner;
		    result.hash = hash;
		    result.repository = repository;
		    
		    xourse.html = result.data;
		    xourse.repositoryName = result.repository;
		    xourse.ownerName = result.owner;
		    xourse.branchName = branchName;

		    res.render('xourse', { xourse: xourse });
		}
	    }
	});
};
