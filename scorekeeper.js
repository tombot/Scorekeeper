var express = require('express')
  , http = require('http')
  , socketio = require('socket.io')
  , path = require('path')
  , _ = require('underscore')._;

var app = express();

// Scoring models
function ScoreCycle() {
  this.num_assists = 0;
  this.truss = false;
  this.caught = false;
  this.ended_high = false;
  this.ended_low = false;
  this.score = 0;
  this.calc_score = function() {
    var score = 0;
    if (this.caught) {
      score += 10;
    }
    if (this.truss) {
      score += 10;
    }
    if (this.ended()) {
      score += (this.ended_high ? 10 : (this.ended_low ? 1 : 0));
      score += (this.num_assists >= 3 ? 30 : (this.num_assists - 1) * 10);
    }
    this.score = score;
    return score;
  }
  this.ended = function() {
    return this.ended_high || this.ended_low;
  }
  this.increment_assists = function() {
    this.num_assists += 1;
    if (this.num_assists > 3) {
      this.num_assists = 0;
    }
  }
}

function AllianceScore (color) {
  this.color = color
  this.auto_ball_1 = { high: false, low: false , hot: false};
  this.auto_ball_2 = { high: false, low: false , hot: false};
  this.auto_ball_3 = { high: false, low: false , hot: false};
  this.cycles = [];
  this.current_cycle = new ScoreCycle();
  this.score = 0;
  this.score_auto_ball = function(auto_ball) {
    return (auto_ball.high * 10) + (auto_ball.low * 1) + (auto_ball.hot * 5) + ((auto_ball.high || auto_ball.low) * 10);
  }
  this.calc_score = function() {
    var cycle_score = _.reduce(this.cycles, function(score, cycle) { return score + cycle.calc_score(); }, 0);
    cycle_score += this.score_auto_ball(this.auto_ball_1);
    cycle_score += this.score_auto_ball(this.auto_ball_2);
    cycle_score += this.score_auto_ball(this.auto_ball_3);
    this.score = cycle_score;
    this.score += this.current_cycle.calc_score();
    return cycle_score;
  }
  this.commit_cycle = function() {
    this.cycles.push(this.current_cycle);
    this.current_cycle = new ScoreCycle();
    this.calc_score();
  }
  this.reset = function() {
    this.cycles = [];
    this.current_cycle = new ScoreCycle();
    this.calc_score();
  }
}
 
var server = http.createServer(app).listen(8008, function () {
    console.log("Express server listening on port " + 8008);
});

io = socketio.listen(server);

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/views/index.html');
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/edit', function (req, res) {
  res.sendfile(__dirname + '/views/edit.html');
});

app.get('/display', function (req, res) {
  res.sendfile(__dirname + '/views/display.html');
});

var blue_score = new AllianceScore('blue');
var red_score = new AllianceScore('red');
var scores = {blue: blue_score, red: red_score};

io.sockets.on('connection', function (socket) {
  socket.on('get_score', function(data) {
    socket.emit('score_update', scores);
  });
  socket.on('new_match', function (data) {
    blue_score.reset();
    red_score.reset();
    socket.emit('score_update', scores);
    socket.broadcast.emit('score_update', scores);
  });
  socket.on('edit_update', function (data, thing) {
    var color = data.color;
    var event_type = data.event_type;
    var score_to_update = color == "blue" ? blue_score : red_score;
    if (event_type == "dead_ball") {
      score_to_update.current_cycle = new ScoreCycle();
    } else if (event_type == "increment_assists") {
      score_to_update.current_cycle.increment_assists();
    } else if (event_type == "score") {
      score_to_update.current_cycle.ended_high = data.high;
      score_to_update.current_cycle.ended_low = data.low;
      score_to_update.commit_cycle();
    } else if (event_type == "truss") {
      score_to_update.current_cycle.truss = data.done;
    } else if (event_type == "catch") {
      score_to_update.current_cycle.caught = data.done;
    }
    score_to_update.calc_score();
    socket.emit('score_update', scores);
    socket.broadcast.emit('score_update', scores);
  });
});
