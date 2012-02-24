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

(function() {

  var observedList = [];

  function addToObservedList(model) {
    observedList.push(modelTrackerMap.get(model));
  }

  function removeFromObservedList(model) {
    var tracker = modelTrackerMap.get(model);
    var index = observedList.indexOf(tracker);
    if (index < 0)
      throw Error('Unable to remove expected tracker');
    observedList.splice(index, 1);
  }

  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function isObject(obj) {
    return obj === Object(obj);
  }

  Model.dirtyCheck = function() {
    do {
      observedList.forEach(addNotification);
      startNotifications();
    } while (notificationsMade)
  }

  // Notifications happen in this order:
  //   1) All propertySet add/deletes for all observed objects
  //   2) "Path" values for all observed paths, depth-first from mutated objects
  var notificationQueue = [];

  function addNotification(tracker) {
    if (!tracker)
      throw Error('Added empty tracker');
    notificationQueue.push(tracker);
  };

  var firstException;
  var notificationsMade;

  function logExceptionDuringNotification(ex) {
    if (Model.throwFirstException_ && !firstException)
      firstException = ex;
    else
      console.error('Exception during Model mutation notification:', ex);
  }

  var notificationQueueIsRunning = false;

  function startNotifications() {
    if (notificationQueueIsRunning)
      return;
    notificationQueueIsRunning = true;
    notificationsMade = false;
    firstException = undefined;

    for (var i = 0; i < notificationQueue.length; i++) {
      var tracker = notificationQueue[i];
      if (tracker.dead)
        continue;
      tracker.notify();
    }

    notificationQueue = [];
    notificationQueueIsRunning = false;

    if (firstException)
      throw firstException;
  };

  // Map: { model -> Tracker(model) };
  var modelTrackerMap = new WeakMap;

  function createTracker(model) {
    if (model instanceof Array)
      return new ArrayTracker(model);

    return new ObjectTracker(model);
  }

  function getModelTracker(data) {
    var tracker = modelTrackerMap.get(data);
    if (!tracker) {
      var tracker = createTracker(data);
      modelTrackerMap.set(data, tracker);
      addToObservedList(data);
    }

    return tracker;
  }

  /**
   * Returns the observable "model" at |path| from |data|.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to retrieve a value.
   * @return {*} The current value at |path| from |data| -- If the value is
   *     an object, then an "observable" (proxy) is returned.
   */
  Model.getValueAtPath = function(data, path) {
    if (path) {
      path = new Path(path);
      if (path.length > 0) {
        var copy = data;
        data = undefined;
        path.walk(copy, function(m, i) {
          if (i == path.length) {
            data = m;
          }
        });
      }
    }

    return data;
  };

  /**
   * Observes adds/deletes of properties on |data|.
   * @param {object} data The reference object.
   * @param {function} callback Function to be called when a property is added
   *     or deleted from |data|.
   */
  Model.observePropertySet = function(data, callback) {
    if (!isObject(data))
      return;

    getModelTracker(data).addObserver(callback);
  };

  /**
   * Stops observation of adds/deletes on |data|.
   * @param {object} data The reference object.
   * @param {function} callback Function previously registered with |data| via
   *     Model.observePropertySet().
   */
  Model.stopObservingPropertySet = function(data, callback) {
    if (!isObject(data))
      return;

    var tracker = modelTrackerMap.get(data);
    if (!tracker)
      return;

    tracker.removeObserver(callback);
    if (!tracker.dependants) {
      removeFromObservedList(data);
      modelTrackerMap['delete'](data);
    }
  };

  /**
   * Observes the value at a path from an object. |callback| is invoked
   * IFF the value changes.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @param {function} callback Function to be called when the value changes.
   * @return {*} The current value of the observed path from the object.
   */
  Model.observe = function(data, path, callback) {
    path = new Path(path);

    // If the data is unobservable
    if (!isObject(data))
      throw Error('Invalid path from unobservable data');

    var pathTracker = getModelTracker(data)

    for (var i = 0; i < path.length; i++) {
      pathTracker = pathTracker.getDescendant(path.get(i));
    }

    pathTracker.addObserver(callback);
    return pathTracker.value;
  };

  /**
   * Stops observation of changes to the value at a path from an object.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @param {function} callback Function previously registered with |data|  and
   *     |path| via Model.observe().
   */
  Model.stopObserving = function(data, path, callback) {
   if (!isObject(data))
      return;

    path = new Path(path);
    if (path.length == 0)
      return;

    var tracker = modelTrackerMap.get(data);
    if (!tracker)
      return;

    var pathTracker = tracker;
    for (var i = 0; i < path.length; i++) {
      var propertyName = path.get(i);
      if (!pathTracker.hasDescendant(propertyName))
        return;

      pathTracker = pathTracker.getDescendant(propertyName);
    }

    pathTracker.removeObserver(callback);

    if (!tracker.dependants) {
      removeFromObservedList(data);
      modelTrackerMap['delete'](data);
    }
  };

  function observePropertyValue(data, name, pathTracker) {
    getModelTracker(data).addValueObserver(name, pathTracker);
  }

  function stopObservingPropertyValue(data, name, pathTracker) {
    var tracker = modelTrackerMap.get(data);
    if (!tracker)
      return;

    tracker.removeValueObserver(name, pathTracker);
    if (!tracker.dependants) {
      removeFromObservedList(data);
      modelTrackerMap['delete'](data);
    }
  }

  // ValueTracker is the root of the "tracker" classes. It is "abstract".
  // It provides common implementations of adding, removing & notifying
  // observers, as well as "descendants". Note that all concrete subclasses
  // can have descendants which are Path(Value)Trackers.
  function ValueTracker() {}

  ValueTracker.prototype = {
    dependants_: 0,

    // Trackers marked as dead will be skipped in the notificationQueue.
    // This will most likely result because an earlier callback caused an
    // observer to observe a different path.
    dead: false,

    // Invoked by the notificationQueue during the main loop of dirtyChecking/
    // projecting observer changes. A tracker should call notifyObservers
    // on itself any number of times, but only schedule notifications for its
    // descendants via addNotification(descendant);
    notify: function() {},

    // Called when the sum of observers and descendants is greater than 0,
    // and when it returns to zero. Trackers may want to use to setup/tear down.
    set hasDependants(hasDependants) {},

    set dependants(dependants) {
      var hadDependants = !!this.dependants_;
      var hasDependants = dependants;
      this.dependants_ = dependants;

      if (hasDependants != hadDependants)
        this.hasDependants = hasDependants;
    },

    get dependants() { return this.dependants_; },

    // Called when observers.length becomes greater than 0. Trackers may want to
    // initialize some state (like a lastValue) when this occurs.
    initObservationState: function() {},

    // Called when observers.length returns to 0. Trackers may want to abandon
    // any observation state.
    clearObservationState: function() {},

    addObserver: function(callback) {
      if (!this.observers) {
        this.observers = [callback];
        this.initObservationState();
        return;
      }

      var index = this.observers.indexOf(callback);
      if (index >= 0)
        return;

      this.observers.push(callback);
      this.dependants++;
    },

    removeObserver: function(callback) {
      if (!this.observers)
        return;

      var index = this.observers.indexOf(callback);
      if (index < 0)
        return;

      this.observers.splice(index, 1);
      this.dependants--;
      if (this.observers.length == 0) {
        this.observers = undefined;
        this.clearObservationState();
      }
    },

    notifyObservers: function() {
      if (!this.observers)
        return;
      var args = arguments;
      this.observers.concat().forEach(function(callback) {
        notificationsMade = true;

        try {
          callback.apply(undefined, args);
        } catch (ex) {
          logExceptionDuringNotification(ex);
        }
      });
    },

    getDescendant: function(name) {
      if (!this.descendants)
        this.descendants = {};

      if (this.descendants[name])
        return this.descendants[name];

      var tracker = new PathTracker(this, name);
      this.addDescendant(name, tracker);
      return tracker;
    },

    addDescendant: function(name, tracker) {
      this.descendants[name] = tracker;
      this.dependants++;
    },

    removeDescendant: function(name) {
      delete this.descendants[name];
      this.dependants--;
    },

    hasDescendant: function(name) {
      return this.descendants && this.descendants[name];
    }
  }

  // PathTracker represents a value at a path from an observable object.
  // Multiple observations along similar paths will create a graph of
  // PathTrackers with nodes being propertyNames. Node that this graph will
  // "overlay" the underlying objects in different ways as the object property
  // values change.
  function PathTracker(root, propertyName) {
    this.propertyName = propertyName;
    this.setRoot(root); // Sets up the observer and initial value
  }

  PathTracker.prototype = createObject({
    __proto__: ValueTracker.prototype,

    initObservationState: function() {
      this.lastValue = this.value;
    },

    clearObservationState: function() {
      this.lastValue = undefined;
    },

    set hasDependants(hasDependants) {
      if (hasDependants)
        return;

      // Tear down.
      if (this.observing) {
        stopObservingPropertyValue(this.observing,
                                   this.propertyName,
                                   this);
        this.observing = null;
      }

      this.root.removeDescendant(this.propertyName);

      this.value = undefined;
      this.root = undefined;
      this.propertyName = undefined;
      this.dead = true;
    },

    setRoot: function(root) {
      if (this.observing) {
        stopObservingPropertyValue(this.observing, this.propertyName, this);
        this.observing = undefined;
      }

      this.root = root;

      var newValue = undefined;
      if (isObject(root.value)) {
        this.observing = root.value;
        observePropertyValue(this.observing, this.propertyName, this);
        newValue = this.observing[this.propertyName];
      }

      this.dirtyCheck(newValue);
    },

    dirtyCheck: function(newValue) {
      if (this.value === newValue)
        return false;

      var oldValue = this.value;
      this.value = newValue;

      if (this.descendants) {
        Object.keys(this.descendants).forEach(function(propertyName) {
          this.descendants[propertyName].setRoot(this);
        }, this);
      }

      return true;
    },

    notify: function() {
      if (this.observers && this.value !== this.lastValue) {
        var oldValue = this.lastValue;
        this.lastValue = this.value;
        this.notifyObservers(this.value, oldValue);
      }

      // Schedule descendants to notify
      if (this.descendants) {
        var keys = Object.keys(this.descendants);
        for (var i = 0; i < keys.length; i++) {
          addNotification(this.descendants[keys[i]]);
        }
      }
    },

    dirtyCheckAndNotify: function(newValue) {
      if (this.dead)
        throw Error('dirtyCheckAndNotify callback received at dead tracker');

      // dirtyCheck will allow all descendants to dirtyCheck. Notifications
      // are scheduled.
      if (this.dirtyCheck(newValue))
        addNotification(this);
    }
  });

  // ObjectTracker is responsible for tracking changes to the set of properties
  // on an object. It is also always the "root" of any graph of PathTrackers.
  function ObjectTracker(model) {
    this.target = model;
  }

  function createPropertySet(obj) {
    var set = {};
    for (var prop in obj) {
      set[prop] = true;
    }
    return set;
  }

  ObjectTracker.prototype = createObject({
    __proto__: ValueTracker.prototype,

    initObservationState: function() {
      this.lastPropertySet = createPropertySet(this.target);
    },

    clearObservationState: function() {
      this.lastPropertySet = undefined;
    },

    get value() {
      return this.target;
    },

    addValueObserver: function(name, observer) {
      if (!this.valueObservers)
        this.valueObservers = {};

      var observers = this.valueObservers[name];
      if (!observers) {
        observers = [];
        this.valueObservers[name] = observers;
      }

      var index = observers.indexOf(observer);
      if (index < 0) {
        observers.push(observer);
        this.dependants++;
      }
    },

    removeValueObserver: function(name, observer) {
      if (!this.valueObservers)
        return;

      var observers = this.valueObservers[name];
      if (!observers)
        return;

      var index = observers.indexOf(observer);
      if (index < 0)
        return;

      observers.splice(index, 1);
      this.dependants--;
      if (observers.length == 0)
        delete this.valueObservers[name];
    },

    notifyValueObservers: function() {
      if (this.valueObservers) {
        for (var prop in this.valueObservers) {
          var newValue = this.target[prop];
          this.valueObservers[prop].forEach(function(pathTracker) {
            pathTracker.dirtyCheckAndNotify(newValue);
          });
        }
      }
    },

    notify: function() {
      this.notifyValueObservers();

      if (this.lastPropertySet) {
        var currentSet = createPropertySet(this.target);
        for (var prop in this.lastPropertySet) {
          if (!(prop in currentSet))
            this.notifyPropertySetChange(prop, 'delete');
          else
            currentSet[prop] = false; // not new
        }

        for (var prop in currentSet) {
          if (currentSet[prop])
            this.notifyPropertySetChange(prop, 'add');

          currentSet[prop] = true;
        }

        this.lastPropertySet = currentSet;
      }
    },

    notifyPropertySetChange: function(name, type) {
      this.notifyObservers({
        propertyName: name,
        mutation: type,
        model: this.target
      });
    },
  });

  // ArrayTracker is specialized because it "projects" all underlying "splice"
  // mutations into the most compact set of splices needed to represent the
  // union of changes.
  function ArrayTracker(target) {
    this.target = target;
    // TODO(rafaelw): Shouldn't need to keep a copy for the proxied case.
    this.copy = target.concat();
    this.virtualLength = this.copy.length;
  }

  function newSpliceMutation(index, deleteCount, addCount) {
    return {
      mutation: 'splice',
      index: index,
      deleteCount: deleteCount,
      addCount: addCount
    }
  }

  function intersect(start1, end1, start2, end2) {
    if (start1 > end1 || start2 > end2)
      throw Error('Invalid splice range provided: ' +
                  [start1, end1, start2, end2].join(', '));

    // Disjoint
    if (end1 < start2 || end2 < start1)
      return -1;

    // Adjacent
    if (end1 == start2 || end2 == start1)
      return 0;

    // Non-zero intersect, span1 first
    if (start1 < start2) {
      if (end1 < end2)
        return end1 - start2; // Overlap
      else
        return end2 - start2; // Contained
    } else {
      // Non-zero intersect, span2 first
      if (end2 < end1)
        return end2 - start1; // Overlap
      else
        return end1 - start1; // Contained
    }
  }

  // "Synthesizes" the splices which, when applied to |old|, will
  // transform it into |current|.
  function calcSplices(old, current) {
    var LEAVE = 0;
    var UPDATE = 1;
    var ADD = 2;
    var DELETE = 3;

    function minThree(one, two, three) {
      return Math.min(one, Math.min(two, three));
    }

    // Note: This function is *based* on the computation of the Levenshtein
    // "edit" distance. The one change is that "updates" are treated as two
    // edits - not one. With Array splices, an update is really a delete
    // followed by an add. By retaining this, we optimize for "keeping" the
    // maximum array items in the original array. For example:
    //
    //   'xxxx123' -> '123yyyy'
    //
    // With 1-edit updates, the shortest path would be just to update all seven
    // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
    // leaves the substring '123' intact.
    function calcEditDistances(old, current) {
      // "Deletion" columns
      var distances = new Array(old.length + 1);

      // "Addition" rows. Initialize null column.
      for (var i = 0; i < distances.length; i++) {
        distances[i] = new Array(current.length + 1)
        distances[i][0] = i;
      }

      // Initialize null row
      for (var j = 0; j < distances[0].length; j++) {
        distances[0][j] = j;
      }

      for (var i = 1; i < distances.length; i++) {
        for (var j = 1; j < distances[i].length; j++) {
          if (old[i - 1] === current[j - 1])
            distances[i][j] = distances[i - 1][j - 1];
          else
            distances[i][j] = minThree(distances[i - 1][j] + 1,      // 1 Edit
                                       distances[i][j - 1] + 1,      // 1 Edit
                                       distances[i - 1][j - 1] + 2); // 2 Edits
        }
      }

      return distances;
    }

    // This starts at the final weight, and walks "backward" by finding
    // the minimum previous weight recursively until the origin of the weight
    // matrix.
    function operations(distances) {
      var i = distances.length - 1;
      var j = distances[0].length - 1;
      var last = distances[i][j];
      var edits = [];
      while(i > 0 || j > 0) {
        if (i == 0) {
          edits.push(ADD);
          j--;
          continue;
        }
        if (j == 0) {
          edits.push(DELETE);
          i--;
          continue;
        }
        var updateOrNoop = distances[i - 1][j - 1];
        var deletion = distances[i - 1][j];
        var addition = distances[i][j - 1];

        var min = minThree(updateOrNoop, deletion, addition);
        if (min == updateOrNoop) {
          if (updateOrNoop == last) {
            edits.push(LEAVE);
          } else {
            edits.push(UPDATE);
            last = updateOrNoop;
          }
          i--;
          j--;
        } else if (min == deletion) {
          edits.push(DELETE);
          i--;
          last = deletion;
        } else {
          edits.push(ADD);
          j--;
          last = addition;
        }
      }

      edits.reverse();
      return edits;
    }

    var ops = operations(calcEditDistances(old, current));

    var splice = undefined;
    var splices = [];
    var index = 0;
    for (var i = 0; i < ops.length; i++) {
      switch(ops[i]) {
        case LEAVE:
          if (splice) {
            splices.push(splice);
            splice = undefined;
          }
          index++;
          break;
        case UPDATE:
          if (!splice) {
            splice = newSpliceMutation(index, 1, 1);
          } else {
            splice.addCount++;
            splice.deleteCount++;
          }
          index++;
          break;
        case ADD:
          if (!splice) {
            splice = newSpliceMutation(index, 0, 1);
          } else {
            splice.addCount++;
          }
          index++;
          break;
        case DELETE:
          if (!splice) {
            splice = newSpliceMutation(index, 1, 0);
          } else {
            splice.deleteCount++;
          }
          break;
      }
    }

    if (splice) {
      splices.push(splice);
    }

    return splices;
  }

  // Only exposed for testing.
  this.ArrayTracker = ArrayTracker;

  ArrayTracker.prototype = createObject({
    __proto__: ObjectTracker.prototype,

    notify: function() {
      this.generateSplices();

      // TODO(rafaelw): Optimize. ArrayTracker only needs to notify a subset
      // of its value observers.
      this.notifyValueObservers();

      while(this.splices.length) {
        var splice = this.splices.shift();
        var spliceArgs = [splice.index, splice.deleteCount];
        var addIndex = splice.index;
        while (addIndex < splice.index + splice.addCount) {
          spliceArgs.push(this.target[addIndex]);
          addIndex++;
        }

        var removed = Array.prototype.splice.apply(this.copy, spliceArgs);
        var added = Array.prototype.slice.call(spliceArgs, 2);
        this.notifySplice(splice.index, removed, added);
      }

      this.splices = undefined;
    },

    notifySplice: function(index, removed, added) {
      this.notifyObservers({
        mutation: 'splice',
        index: index,
        added: added,
        removed: removed
      });
    },

    generateSplices: function() {
      this.splices = calcSplices(this.copy, this.target);
    }
  });
})();
