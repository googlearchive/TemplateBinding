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

function Model() {
  throw Error('Use Model.get instead')  ;
}

(function() {
  function MutationQueue() {};

  var mutationQueue = [];

  MutationQueue.add = function(callback) {
    var mutation = {
      callback: callback,
      handle: {cancelled: false}
    };

    mutationQueue.push(mutation);
    return mutation.handle;
  };

  var mutationQueueIsRunning = false;

  MutationQueue.runUntilEmpty = function() {
    if (mutationQueueIsRunning)
      return;
    mutationQueueIsRunning = true;

    var exception;
    for (var i = 0; i < mutationQueue.length; i++) {
      var mutation = mutationQueue[i];
      if (!mutation.handle.cancelled) {
        try {
          mutation.callback();
        } catch (ex) {
          if (!exception)
            exception = ex;
        }
      }
    }

    mutationQueue = [];
    mutationQueueIsRunning = false;

    if (exception)
      throw exception;
  };

  var proxiesImplemented = !!this.Proxy;
  if (!proxiesImplemented) {
    console.warn(
        'Proxy are not available. Changes to models will not be observable.');
  }

  var objectTrackerMap = new WeakMap;

  function isObject(obj) {
    return obj === Object(obj);
  }

  var mutationLog = new MutationLog;

  AspectWorkQueue.register(mutationLog, projectMutations);

  /**
   * @param {*} s The value to test.
   * @return {boolean} Whether a value is a considered an indexed property name.
   *     Indexes are uint32.
   */
  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function projectMutations() {
    var dirtyObjectsSet = new WeakMap;
    var trackers = [];

    mutationLog.clear().forEach(function(mutation) {
      var target = mutation.target;
      var tracker = objectTrackerMap.get(target);
      if (tracker) {
        tracker.addMutation(mutation);
        if (!dirtyObjectsSet.has(target)) {
          dirtyObjectsSet.set(target, true);
          trackers.push(tracker);
        }
      }
    });

    trackers.forEach(function(tracker) {
      tracker.notify();
    });
  }

  function getObserverIndex(observers, callback) {
    for (var i = 0; i < observers.length; i++) {
      if (observers[i].callback === callback)
        return i;
    }
    return -1;
  }

  function createNewObserver(callback) {
    return {callback: callback};
  }

  Model.get = function(data, path) {
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

    if (!isObject(data))
      return data;

    return Object.getObservable(data);
  };

  var pathValueMap = new WeakMap;

  /**
   * Observes the value at a path from an object. |callback| is invoked
   * IFF the value changes.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @return {*} The current value of the observed path from the object.
   */
  Model.observe = function(data, path, callback) {
    path = new Path(path);

    // Return an "anonymous root" PathValue which is not (and can not) be
    // observed, but whose value can be read and written
    // TODO(rafaelw): This is a bit unfortunate when data isn't a scalar.
    // it means that there may be more than one PathValue pointing at the
    // same root object. Perhaps its better to allow root pathValues to be
    // valid without observers, and if their value is set, the pathValueMap
    // is updated with the new key.
    if (path.length == 0)
      return new PathValue(data);

    // If the data is unobservable
    if (!isObject(data))
      throw Error('Invalid path from unobservable data');

    var model = Model.get(data);

    var pathValue = pathValueMap.get(model);
    if (!pathValue) {
      pathValue = new PathValue(model);

      if (isObject(model))
        pathValueMap.set(model, pathValue);
    }

    for (var i = 0; i < path.length; i++) {
      pathValue = pathValue.getDescendant_(path.get(i));
    }

    pathValue.observe(callback);
    return pathValue.value;
  };

  Model.observeObject = function(data, callback) {
    if (!isObject(data))
      return;

    var model = Object.getObservable(data);

    var tracker = objectTrackerMap.get(model);
    if (!tracker) {
      var tracker = createTracker(model);
      objectTrackerMap.set(model, tracker);
      Object.observe(model, mutationLog);
    }

    tracker.addCallback(callback);
  };

  Model.stopObserving = function(data, path, callback) {
   if (!isObject(data))
      return;

    var model = Object.getObservable(data);

    path = new Path(path);
    if (path.length == 0)
      return;

    var rootValue = pathValueMap.get(model);
    if (!rootValue)
      return;

    var pathValue = rootValue;
    for (var i = 0; i < path.length; i++) {
      var propertyName = path.get(i);
      if (!pathValue.hasDescendant_(propertyName))
        return;

      pathValue = pathValue.getDescendant_(propertyName);
    }

    pathValue.stopObserving(callback);
    if (!rootValue.hasObservers_) {
      pathValueMap['delete'](model);
    }
  };

  Model.stopObservingObject = function(data, callback) {
    if (!isObject(data))
      return;

    var model = Object.getObservable(data);

    var tracker = objectTrackerMap.get(model);
    if (!tracker)
      return;

    tracker.removeCallback(callback);
    if (!tracker.hasCallbacks) {
      objectTrackerMap.delete(model);
      Object.stopObserving(model, mutationLog);
    }
  };

  function checkIsValid(pathValue) {
    if (!pathValue.valid)
      throw Error('Unknown state: Observers must remain for value to be ' +
                  'valid.');
  }

  /**
   * PathValue is an (externally) immutable representation of a value from a
   * reference object to a Path. As long as observers are present on a PathValue
   * or any of its descendants (at deeper paths), its value is consistent.
   * All paths from the same reference object are structured as a tree,
   * with each deeper path represented as a set of descendants from the previous
   * depth level. Each PathValue is observing mutations to its reference object
   * (if it is current observable, i.e. an object), and when the propertyName of
   * its reference object changes value, it immediately propogates that change
   * to its descendants, then schedules notifications to fire (see notification
   * sequence above in comments of notifyChange()).
   * @param {*} root The value with is the reference of this PathValue.
   *     This will always either be a value, in which case this is the "root"
   *     value, or it will be a parent PathValue.
   * @return {string} propertyName If present, the property from the root that
   *     this PathValue represents. If absent, this PathValue is the root of an
   *     observation tree.
   */
  function PathValue(root, propertyName) {
    if (propertyName) {
      this.boundRefChanged_ = this.refChanged_.bind(this);
      this.boundNotify_ = this.notify_.bind(this);
      this.propertyName_ = propertyName;
      this.setRoot_(root); // Sets up the observer and initial value
    } else {
      // This PathValue is the root (holds onto the top-level model)
      this.value_ = root;
    }
  }

  PathValue.prototype = {
    get value() {
      checkIsValid(this);
      return this.value_;
    },

    /**
     * A PathValue is valid when there is at least one observer registered at
     * this depth or deeper -- or if it is an "anonymous root" (i.e. retrieved
     * via Model.observe() and an empty path).
     * @return {boolean} valid Returns whether the |value| property of this
     *     PathValue is valid and can be read.
     */
    get valid() {
      return this.root_ === undefined || this.hasObservers_;
    },

    get ref_() {
      // The reference object will always be a PathValue except when it's the
      // root object.
      return this.root_ instanceof PathValue ? this.root_.value : this.root_;
    },

    setRoot_: function(root) {
      // Deregister observation of old reference.
      if (this.observing_) {
        Model.stopObservingObject(this.observing_, this.boundRefChanged_);
        this.observing_ = null;
      }
      this.root_ = root;
      var ref = this.ref_;

      if (isObject(ref)) {
        Model.observeObject(ref, this.boundRefChanged_);
        this.observing_ = ref;
      }

      var newValue = Model.get(ref, this.propertyName_);

      this.valueMaybeChanged_(newValue);
    },

    valueMaybeChanged_: function(newValue) {
      if (this.value_ === newValue)
        return false;

      var oldValue = this.value_;
      var newValue = this.value_ = newValue;

      if (this.descendants_) {
        Object.keys(this.descendants_).forEach(function(propertyName) {
          this.descendants_[propertyName].setRoot_(this);
        }, this);
      }

      return true;
    },

    notify_: function() {
      // Notify Listeners
      var exception;
      if (this.observers_) {
        var self = this;
        this.observers_.concat().forEach(function(observer) {
          try {
            var newValue = self.value;
            var oldValue = observer.lastObservedValue;
            if (newValue !== oldValue) {
              observer.lastObservedValue = newValue;
              observer.callback(newValue, oldValue);
            }
          } catch (ex) {
            if (!exception)
              exception = ex;
          }
        });
      }

      // Schedule descendants to notify
      if (this.descendants_) {
        var keys = Object.keys(this.descendants_);
        for (var i = 0; i < keys.length; i++) {
          var descendant = this.descendants_[keys[i]];
          MutationQueue.add(descendant.boundNotify_);
        }
      }

      if (exception)
        throw exception;
    },

    refChanged_: function(change) {
      if (this.dead_) {
        // TODO(rafaelw): Re-enable this check when we convert to using an
        // inert MutationQueue (don't have to cancel pending callbacks on
        // Model.stopObservingObject).
        // throw Error('refChanged_ callback received at dead PathValue');
        return;
      }
      // refChanged_ is called as an observer (Model.observeObject) of this
      // PathValue's reference object (if any). The behavior is to update
      // value_, propagate all updates to descendants, then schedule a single
      // new observer to fire
      // notifications from this
      if (change.propertyName === this.propertyName_) {
        if (this.valueMaybeChanged_(change.value))
          MutationQueue.add(this.boundNotify_);
      }

      // Handle array notification
      if (change.mutation != 'splice' || !isIndex(this.propertyName_))
        return;

      var index = +this.propertyName_;
      if (change.index > index)
        return;

      if (index < (change.index + change.removed.length) ||
          change.removed.length != change.added.length) {
        if (this.valueMaybeChanged_(Model.get(this.ref_, this.propertyName_)))
          MutationQueue.add(this.boundNotify_);
      }
    },

    observe: function(callback) {
      // Nothing to be observed. This is either the root object or a PathValue
      // holding a scalar value.
      if (!this.root_)
        return;

      // This is tricky: We have to wait to call this.value until we have at
      // least one observer registered. Otherwise, this.value will throw
      // in inconsistency.
      var observer;
      this.observers_ = this.observers_ || [];
      var index = getObserverIndex(this.observers_, callback);
      if (index < 0) {
        observer = createNewObserver(callback);
        this.observers_.push(observer);
      } else {
        observer = this.observers_[index];
      }

      observer.lastObservedValue = this.value;
    },

    stopObserving: function(callback) {
      if (!this.observers_)
        return;

      var index = getObserverIndex(this.observers_, callback);
      if (index < 0)
        return;

      this.observers_.splice(index, 1);

      // PathValue becomes invalid when last observer is removed.
      if (this.observers_.length == 0) {
        delete this.observers_;
        this.maybeDestruct_();
      }
    },

    get hasObservers_() {
      return this.observers_ ||
             (this.descendants_ && Object.keys(this.descendants_).length);
    },

    maybeDestruct_: function() {
      // maybeDestruct_ is called every time an observer or descendant is
      // removed. If a PathValue has neither, then it is no longer valid and
      // must stop observation of its reference object, tear-down and remove
      // itself from its parent.
      if (this.hasObservers_)
        return;

      if (this.observing_) {
        Model.stopObservingObject(this.observing_, this.boundRefChanged_);
        this.observing_ = null;
      }

      // This path value doesn't have observers or descendants, remove it
      // from its parent, if it has one
      if (this.root_ instanceof PathValue) {
        this.root_.removeDescendant_(this.propertyName_);
      } else {
        // Make sure the main pathValueMap isn't holding onto a dead root
        // PathValue.
        pathValueMap['delete'](this.value_);
      }
      this.value_ = null;
      this.root_ = null;
      this.propertyName_ = null;
      this.descendants_ = null;
      this.dead_ = true;
    },

    hasDescendant_: function(propertyName) {
      return this.descendants_ && propertyName in this.descendants_;
    },

    getDescendant_: function(propertyName) {
      if (this.hasDescendant_(propertyName)) {
        return this.descendants_[propertyName];
      }

      // It's important that we create the key in this.descendants_
      // before initializing the new PathValue because the new PathValue
      // will attempt to access the |value| property of |this| and
      // we need to let it know that it has at least one descendant, so it
      // won't throw.
      this.descendants_ = this.descendants_ || {};
      this.descendants_[propertyName] = undefined;
      var pv = new PathValue(this, propertyName);
      this.descendants_[propertyName] = pv;
      return pv;
    },

    removeDescendant_: function(propertyName) {
      delete this.descendants_[propertyName];
      this.maybeDestruct_();
    }
  };

  function newSpliceMutation(index, deleteCount, addCount, target) {
    return {
      mutation: 'splice',
      index: index,
      deleteCount: deleteCount,
      addCount: addCount,
      target: target
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

  // TODO(rafaelw): This can go away when we move to Model.observeProperty.
  function observableProps(obj) {
    var retval = [];
    var htmlElement = !!obj.tagName;
    for (var prop in obj) {
      if (htmlElement && prop != 'model')
        continue;
      retval.push(prop);
    }

    return retval;
  }

  function shallowClone(obj) {
    var clone = {};
    observableProps(obj).forEach(function(prop) {
      clone[prop] = obj[prop];
    });
    return clone;
  }

  function ObjectTracker(model) {
    this.target = model;
    this.copy = shallowClone(model);
  }

  ObjectTracker.prototype = {
    addMutation: function(mutation) {}, // noop for object

    addCallback: function(callback) {
      if (!this.observers)
        this.observers = [];
      var index = this.observers.indexOf(callback);
      if (index < 0)
        this.observers.push(callback);
    },

    removeCallback: function(callback) {
      if (!this.observers)
        return;

      var index = this.observers.indexOf(callback);
      if (index < 0)
        return;

      this.observers.splice(index, 1);
      if (this.observers.length == 0) {
        this.observers = undefined;
      }
    },

    get hasCallbacks() {
      return !!this.observers;
    },

    notify: function() {
      var newCopy = shallowClone(this.target);
      var propsDeleted = false;

      for (var prop in this.copy) {
        var oldVal = this.copy[prop];
        var newVal = newCopy[prop];

        if (!(prop in newCopy)) {
          this.notifyPropertyChange(prop, 'delete', newVal, oldVal);
          propsDeleted = true;
        } else if (newVal !== oldVal) {
          this.notifyPropertyChange(prop, 'update', newVal, oldVal);
          this.copy[prop] = newCopy[prop];
        }

        delete newCopy[prop];
      }

      for (var prop in newCopy) {
        var val = newCopy[prop];
        this.notifyPropertyChange(prop, 'add', val, undefined);
        this.copy[prop] = val;
      }

      // Handle the 'any props deleted' case seperately. Make a new copy
      // rather than deleting properties from copy, because deleting properties
      // in modern VMs may put the object in the "slow bucket".
      if (propsDeleted)
        this.copy = shallowClone(this.target);
    },

    notifyPropertyChange: function(name, mutation, value, oldValue) {
      this.notifyChange({
        propertyName: name,
        mutation: mutation,
        oldValue: Model.get(oldValue),
        value: Model.get(value)
      });
    },

    notifyChange: function(change) {
      var model = this.target;
      if (!this.observers)
        return;

      change.model = model;

      this.observers.forEach(function(callback) {
        MutationQueue.add(function() {
          callback(change);
        });
      });

      MutationQueue.runUntilEmpty();
    }
  };

  function createTracker(model) {
    if (model instanceof Array)
      return new ArrayTracker(model);

    return new ObjectTracker(model);
  }

  function ArrayTracker(target) {
    this.target = target;
    this.copy = target.concat();
    this.virtualLength = this.copy.length;
  }

  // Only exposed for testing.
  this.ArrayTracker = ArrayTracker;

  ArrayTracker.prototype = createObject({
    __proto__: ObjectTracker.prototype,

    addMutation: function(mutation) {
      if (this.target && mutation.target !== this.target)
        return;
      if (!this.splices)
        this.splices = [];

      var splice;
      if (mutation.mutation == 'set' || mutation.mutation == 'delete') {
        if (!isIndex(mutation.name))
          return;

        var index = +mutation.name;
        if (mutation.mutation == 'delete' && index >= this.virtualLength)
          return;

        splice = newSpliceMutation(index, 1, 1, mutation.target);
      } else {
        splice = newSpliceMutation(mutation.index,
                                   mutation.deleteCount,
                                   mutation.addCount,
                                   mutation.target);
      }

      var range = splice.index + splice.deleteCount;
      var delta = splice.addCount - splice.deleteCount;
      var inserted = false;

      for (var i = 0; i < this.splices.length; i++) {
        var current = this.splices[i];
        var currentRange = current.index + current.addCount;
        var intersectCount = intersect(splice.index,
                                       range,
                                       current.index,
                                       currentRange);

        if (intersectCount >= 0) {
          // Merge the two splices
          splice.index = Math.min(splice.index, current.index);
          splice.deleteCount = splice.deleteCount +
                               current.deleteCount -
                               intersectCount;
          splice.addCount = splice.addCount +
                            current.addCount -
                            intersectCount;
          this.splices.splice(i, 1);
          i--;
        } else if (splice.index <= current.index) {
          current.index += delta;
          if (!inserted) {
            // Insert splice here.
            this.splices.splice(i, 0, splice);
            i++;
            inserted = true;
          }
        }
      }

      if (!inserted)
        this.splices.push(splice);

      this.virtualLength += delta;
    },

    notify: function() {
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
    },

    notifySplice: function(index, removed, added) {
      this.notifyChange({
        mutation: 'splice',
        index: index,
        added: added.map(function(item) {
          return Model.get(item);
        }),
        removed: removed.map(function(item) {
          return Model.get(item);
        })
      });
    }
  });
})();
