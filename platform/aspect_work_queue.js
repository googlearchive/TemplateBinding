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

function AspectWorkQueue() {}

(function() {

  var queueRecords = [];

  function indexOfWorkQueue(workQueue) {
    for (var i = 0; i < queueRecords.length; i++) {
      if (queueRecords[i].workQueue === workQueue)
        return i;
    }

    return -1;
  }

  AspectWorkQueue.register = function(workQueue, callback) {
    var index = indexOfWorkQueue(workQueue);
    var queueRecord;
    if (index >= 0) {
      queueRecord = queueRecords[index];
      queueRecord.workQueue = workQueue;
    } else {
      queueRecord = {workQueue: workQueue};
      queueRecords.push(queueRecord);
    }

    queueRecord.callback = callback;
  }

  AspectWorkQueue.release = function(workQueue) {
    var index = indexOfWorkQueue(workQueue);
    if (index < 0)
      return;

    queueRecords.splice(index, 1);
  }

  AspectWorkQueue.runUntilEmpty = function() {
    var workDone = true;
    var firstTime = true;

    while (workDone) {
      workDone = false;

      if (queueRecords.length) {
        queueRecords.concat().forEach(function(record) {
          if (record.workQueue.length) {
            workDone = true;
            record.callback(record.workQueue.clear());
          } else if (firstTime) {
            record.callback([]);
          }
        });
      }

      firstTime = false;
    }
  }
})()
