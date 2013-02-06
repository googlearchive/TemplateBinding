// Copyright 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var Model = {};

(function(global) {

  var observer = new ChangeSummary.CallbackRouter();

  var queue = [];

  Model.enqueue = function enqueue(func) {
    queue.push(func);
  };

  var notificationQueueIsRunning = false;

  Model.notifyChanges = function() {
    // Prevent reentrancy.
    if (notificationQueueIsRunning)
      return;
    notificationQueueIsRunning = true;

    observer.deliver();

    while (queue.length > 0) {
      var f = queue.shift();
      f();
    }

    notificationQueueIsRunning = false;
  };

  Model.observeArray = observer.observeArray.bind(observer);

  Model.unobserveArray = observer.unobserveArray.bind(observer);

  Model.observePath = observer.observePath.bind(observer);

  Model.unobservePath = observer.unobservePath.bind(observer);

  Model.getValueAtPath = ChangeSummary.getValueAtPath;

  Model.setValueAtPath = ChangeSummary.setValueAtPath;

})(this);
