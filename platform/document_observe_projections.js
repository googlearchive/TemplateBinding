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

function computeAddedRemoved(doc, mutations) {
  var parentChanges = new WeakMap;
  var affectedElements = [];
  var affectedMap = new WeakMap;

  function addToAffected(el) {
    if (affectedMap.has(el))
      return;
    affectedMap.set(el, true);
    affectedElements.push(el);
    for (var i = 0; i < el.childNodes.length; i++) {
      addToAffected(el.childNodes[i]);
    }
  }

  function getChangeRecord(subject) {
    var change = parentChanges.get(subject);
    if (!change) {
      change = {};
      parentChanges.set(subject, change);
    }

    return change;
  }

  mutations.forEach(function(mutation) {
    mutation.removed.forEach(function(subject) {
      var change = getChangeRecord(subject);
      addToAffected(subject);
      
      if (change.addedTo)
        change.addedTo = undefined;
      else
        change.removedFrom = mutation.target;
    });

    mutation.added.forEach(function(subject) {
      getChangeRecord(subject).addedTo = mutation.target;
      addToAffected(subject);
    });
  });

  // Is-reachable computation & caching.
  var reachableCache = new WeakMap;

  function getIsReachable(el) {
    if (el === doc)
      return true;
    if (!el)
      return false;

    if (reachableCache.has(el))
      return reachableCache.get(el);

    var reachable = getIsReachable(el.parentNode);
    reachableCache.set(el, reachable);
    return reachable;
  }

  // Was-reachable computation & caching.
  var wasReachableCache = new WeakMap;

  function getWasReachable(el) {
    if (el === doc)
      return true;
    if (!el)
      return false;

    if (wasReachableCache.has(el))
      return wasReachableCache.get(el);

    var oldParent;
    var change = parentChanges.get(el);
    if (change && change.removedFrom) {
      oldParent = change.removedFrom;
    } else if (!change || !change.addedTo) {
      // If its parent didn't change, then its oldParent is it present parent.
      oldParent = el.parentNode;
    }

    var reachable = getWasReachable(oldParent);
    wasReachableCache.set(el, reachable);
    return reachable;
  }

  var added = [];
  var removed = [];
  function maybeAddedOrRemoved(el) {
    var wasReachable = getWasReachable(el);
    var isReachable = getIsReachable(el);

    // No change in reachability -- nothing to report.
    if (wasReachable == isReachable)
      return;

    if (isReachable)
      added.push(el);
    else
      removed.push(el);
  }
  affectedElements.forEach(maybeAddedOrRemoved);

  return [added, removed];
}