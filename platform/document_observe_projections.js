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

function computeChangesToDocument(doc, mutations) {
  var changeRecords = new WeakMap;
  var spliceMap = new WeakMap;
  var affectedParents = [];
  var affectedChildrenMap = new WeakMap;
  var affectedChildren = [];

  function addToAffectedChildren(el) {
    if (affectedChildrenMap.has(el))
      return;
    affectedChildrenMap.set(el, true);
    affectedChildren.push(el);
    for (var i = 0; i < el.childNodes.length; i++) {
      addToAffectedChildren(el.childNodes[i]);
    }
  }

  function getChangeRecord(subject) {
    var change = changeRecords.get(subject);
    if (!change) {
      change = {};
      changeRecords.set(subject, change);
    }

    return change;
  }

  mutations.forEach(function(mutation) {
    // Update the "splice projection" for this target.
    var splices = spliceMap.get(mutation.target);
    if (!splices) {
      splices = [];
      affectedParents.push(mutation.target);
      spliceMap.set(mutation.target, splices);
    }
    mergeSplice(splices, mutation);

    // Update changeRecords for added/removed children.
    mutation.removed.forEach(function(el) {
      var change = getChangeRecord(el);
      if (change.addedTo)
        change.addedTo = undefined;
      else
        change.removedFrom = mutation.target;

      addToAffectedChildren(el);
    });

    mutation.added.forEach(function(el) {
      getChangeRecord(el).addedTo = mutation.target;
      addToAffectedChildren(el);
    });
  });

  function getOldParent(el) {
    var change = changeRecords.get(el);
    if (change && change.removedFrom) {
      return change.removedFrom;
    } else if (!change || !change.addedTo) {
      // If its parent didn't change, then its oldParent is it present parent.
      return el.parentNode;
    }
  }

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

  var wasReachableCache = new WeakMap;

  function getWasReachable(el) {
    if (el === doc)
      return true;
    if (!el)
      return false;

    if (wasReachableCache.has(el))
      return wasReachableCache.get(el);

    var reachable = getWasReachable(getOldParent(el));
    wasReachableCache.set(el, reachable);
    return reachable;
  }

  var STAYED_UNREACHABLE = 0;
  var STAYED_REACHABLE = 1;
  var ADDED = 2;
  var REMOVED = 3;

  function getChangeType(el) {
    if (getIsReachable(el))
      return getWasReachable(el) ? STAYED_REACHABLE : ADDED;
    else
      return getWasReachable(el) ? REMOVED : STAYED_UNREACHABLE;
  }

  function getMutationType(changeType) {
    return ['NodeMoved', 'NodeMoved', 'NodeAdded', 'NodeRemoved'][changeType];
  }

  var changed = [];

  // Process removals. All removals for the entire document are delivered before
  // any adds or moves.
  affectedChildren.forEach(function (el) {
    if (getChangeType(el) != REMOVED)
      return;

    changed.push({
      target: el,
      mutation: getMutationType(REMOVED)
    });
  })

  // Now process potential adds/removes. These are ordered by:
  // 1. Target (affected parent)
  // 2. Position within resulting childNodes list
  var visitedParents = new WeakMap;

  function visitAffectedParent(el) {
    if (visitedParents.get(el))
      return;
    visitedParents.set(el, true);

    var changeType = getChangeType(el);
    if (changeType == STAYED_UNREACHABLE ||
        changeType == REMOVED)
      return;

    if (changeType == ADDED) {
      // Visit all children.
      for (var i = 0; i < el.childNodes.length; i++)
        processChildMutation(el.childNodes[i]);
    } else {
      // Visit "spliced" children.
      spliceMap.get(el).forEach(function(splice) {
        for (var i = 0; i < splice.addCount; i++) {
          processChildMutation(el.childNodes[splice.index + i]);
        }
      });
    }

    function processChildMutation(el) {
      var changeType = getChangeType(el);
      changed.push({
        target: el,
        mutation: getMutationType(changeType)
      });

      if (changeType == ADDED)
        visitAffectedParent(el);
    }
  }

  affectedParents.forEach(visitAffectedParent);

  return changed;
}

function mergeSplice(splices, mutation) {

  function intersect(start1, end1, start2, end2) {
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

  var splice = {
    mutation: 'splice',
    index: mutation.index,
    deleteCount: mutation.removed.length,
    addCount: mutation.added.length
  };

  var range = splice.index + splice.deleteCount;
  var delta = splice.addCount - splice.deleteCount;
  var inserted = false;

  for (var i = 0; i < splices.length; i++) {
    var current = splices[i];
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
      splices.splice(i, 1);
      i--;
    } else if (splice.index <= current.index) {
      current.index += delta;
      if (!inserted) {
        // Insert splice here.
        splices.splice(i, 0, splice);
        i++;
        inserted = true;
      }
    }
  }

  if (!inserted)
    splices.push(splice);
}