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

// Reachability changeType constants.
var STAYED_UNREACHABLE = 0;
var STAYED_REACHABLE = 1;
var ADDED = 2;
var REMOVED = 3;

function captureNodes(rootNode, list, map) {
  function treeForEach(node) {
    if (!node)
      return;
    list.push(node);
    map.set(node, {
      parentNode: node.parentNode,
      childNodes: Array.prototype.slice.apply(node.childNodes)
    });

    for (var i = 0; i < node.childNodes.length; i++) {
      treeForEach(node.childNodes[i]);
    }
  }

  treeForEach(rootNode)
}

/**
 * MutationTracker: An object which tracks changes to the state of a DOM
 * fragment (typically an entire document).
 *
 * Ex. Usage:
 *   var tracker = new MutationTracker(document.body);
 *   ... (sometime later) ...
 *   tracker.getAdded(); // returns the set of nodes which have been added
 *                       // to the document;
 *   tracker.getRemoved(); // returns the set of nodes which have been removed
 *                         // from the document;
 *   tracker.reset(); // tells the tracker to use the current state of the DOM
 *                    // as reference for future questions about what's changed.
 *
 */
function MutationTracker(rootNode) {
  this.rootNode = rootNode;
  this.reset();
}

MutationTracker.prototype = {
  /**
   * Use the current state of the fragment rooted at |rootNode| as the reference
   * point for future questions about what's changed.
   */
  reset: function() {
    if (this.nodeInfoMap) {
      this.previousTreeNodes = this.treeNodes;
      this.previousNodeInfoMap = this.nodeInfoMap;
    } else {
      this.previousTreeNodes = [];
      this.previousNodeInfoMap = new WeakMap;
      captureNodes(this.rootNode,
                   this.previousTreeNodes,
                   this.previousNodeInfoMap);
    }

    this.treeNodes = undefined;
    this.nodeInfoMap = undefined;
  },

  /**
   * @private This is the shared precompute work needed by the public changed
   * API calls.
   *
   * Complexity: O(n)
   *   n: The number of nodes in the fragment.
   */
  processMutations: function() {
    if (this.treeNodes)
      return;

    this.treeNodes = [];
    this.nodeInfoMap = new WeakMap;

    // Visit all nodes in the fragment and capture the set in treeNodes.
    // Also, for each node, store the node's parentNode and current childNodes
    // list.
    captureNodes(this.rootNode, this.treeNodes, this.nodeInfoMap);
  },

  /**
   * Which nodes have stayed in the fragment, but have been moved to a new
   * parent?
   *
   * Complexity: O(n)
   *   n: The number of nodes in the fragment.
   *
   * @return {Array} An array of nodes which have a new parentNode.
   */
  getChangedParent: function() {
    this.processMutations();

    // Visit all nodes in the current fragment.
    return this.treeNodes.filter(function(node) {
      var nodeInfo = this.nodeInfoMap.get(node);
      var previousNodeInfo = this.previousNodeInfoMap.get(node);

      // The node was present in the previous state and its parentNode
      // has changed.
      return previousNodeInfo &&
             nodeInfo.parentNode != previousNodeInfo.parentNode;
    }, this);
  },

  /**
   * Which nodes were not reachable from the rootNode in the previous state,
   * but now are?
   *
   * Complexity: O(n)
   *   n: The number of nodes in the fragment.
   *
   * @return {Array} An array of nodes which have been added.
   */
  getAdded: function() {
    this.processMutations();

    // Visit all nodes in the current fragment.
    return this.treeNodes.filter(function(node) {
      // If absent from the previous state, node was added.
      return !this.previousNodeInfoMap.has(node);
    }, this);
  },

  /**
   * Which nodes are now reachable from the rootNode, but were not in the
   * previous state?
   *
   * Complexity: O(n)
   *   n: The number of nodes in the fragment.
   *
   * @return {Array} An array of nodes which have been removed.
   */
  getRemoved: function() {
    this.processMutations();

    // Visit all nodes in the previous state.
    return this.previousTreeNodes.filter(function(node) {
      // If absent in the current fragment, node was removed.
      return !this.nodeInfoMap.has(node);
    }, this);
  },

  /**
   * Which nodes exist at novel locations within their parentNode's childNodes
   * list?
   *
   * Note that for any given node, the children which exist at novel locations
   * in its childNodes list, will be returned in ascending order.
   *
   * The idea here is that if the use case is mirroring a tree, the client
   * can maintain a mapping of localNode <-> remoteNode. The changes returned
   * from this call can safely be applied in order to the remoteTree.
   *
   * Ex usage:
   *   tracker.getRemoved().forEach(removeFromRemoteTree);
   *   var addedOrMoved = tracker.getChildlistChanges();
   *   addedOrMoved.forEach(removeFromRemoteTree);
   *   addedOrMoved.forEach(syncToRemoteTree);
   *
   * where |syncToRemoveTree| would handle the case of an node was added be
   * observing that it isn't present in its localNode <-> remoteNode mapping.
   *
   * See function applyChanged() in the accompanying test.
   *
   * Complexity: O(i * c^2)
   *   i: The number of interior (non-leaf) nodes in the fragment.
   *   c: average childNodes per interior node.
   *
   * @return {Array} An array of moved nodes.
   */
  getChildlistChanges: function() {
    this.processMutations();

    var changed = [];

    this.treeNodes.forEach(function(node) {
      var nodeInfo = this.nodeInfoMap.get(node);
      var previousNodeInfo = this.previousNodeInfoMap.get(node);
      if (!previousNodeInfo) {
        // This node was added
        for (var i = 0; i < node.childNodes.length; i++) {
          changed.push(node.childNodes[i]);
        }
      } else {
        var splices = calcSplices(nodeInfo.childNodes,
                                  0,  // currentIndex
                                  nodeInfo.childNodes.length,
                                  previousNodeInfo.childNodes);
        splices.forEach(function(splice) {
          for (var i = 0; i < splice.addCount; i++) {
            changed.push(node.childNodes[splice.index + i]);
          }
        });
      }
    }, this);

    return changed;
  }
}

/**
 * FastMutationTracker: Answers the same questions about what happened to a
 * fragment as the MutationTracker (above), but uses mutation notifications as
 * an optimization to lessen the time/space burden of computing what's changed.
 *
 * Usage: same as MutationTracker (see above), except that it exposes an
 * |observer| property to which DOM mutation records should be delivered.
 */

function FastMutationTracker(rootNode) {
  this.rootNode = rootNode;
  this.mutations = [];
  this.reset();

  var self = this;
  this.observer = function(m) {
    self.mutations = self.mutations.concat(m);
  }
}

FastMutationTracker.prototype = {
  /**
   * Use the current state of the fragment rooted at |rootNode| as the
   * reference point for future questions about what's changed.
   */
  reset: function() {
    this.mutations.length = 0;
    this.parentChangeMap = undefined;
    this.affectedParents = undefined;
    this.affectedChildren = undefined;
    this.reachableCache = undefined;
    this.wasReachableCache = undefined;
    this.spliceMap = undefined;
  },

  /**
   * @private This is the shared precompute work needed by the public changed
   * API calls.
   *
   * Complexity: O(a)
   *   a: The number of node removals and additions which have occurred.
   */
  processMutations: function() {
    if (this.parentChangeMap)
      return;

    var parentChangeMap = this.parentChangeMap = new WeakMap;
    var affectedParents = this.affectedParents = [];

    function getChange(el) {
      var change = parentChangeMap.get(el);
      if (!change) {
        change = {
          oldParentNode: null
        };
        parentChangeMap.set(el, change);
      }

      return change;
    }

    var affectedChildren = this.affectedChildren = [];
    var affectedChildrenMap = new WeakMap;

    function addToAffectedChildren(el) {
      if (affectedChildrenMap.has(el))
        return;
      affectedChildrenMap.set(el, true);
      affectedChildren.push(el);
    }

    this.mutations.forEach(function(mutation) {
      if (mutation.type != 'ChildlistChanged')
        return;

      affectedParents.push(mutation.target);
      mutation.removed.forEach(function(el) {
        var change = getChange(el);
        if (change.added)
          change.added = false;
        else
          change.oldParentNode = mutation.target;

        addToAffectedChildren(el);
      });

      mutation.added.forEach(function(el) {
        var change = getChange(el);
        change.added = true;

        addToAffectedChildren(el);
      });
    });
  },

  /**
   * @private Returns whether a given node:
   *
   *   STAYED_UNREACHABLE
   *   (was) ADDED
   *   (was) REMOVED
   *   STAYED_REACHABLE
   *
   * These four states are the permutations of whether the node
   *
   *   wasReachable(node)
   *   isReachable(node)
   *
   *
   * Complexity: O(log n)
   *   n: The number of nodes in the fragment.
   *
   * @returns {int} changeType (STAYED_UNREACHABLE, ADDED, REMOVED, or
   *     STAYED_REACHABLE).
   */
  reachabilityChange: function(el) {
    this.processMutations();

    this.reachableCache = this.reachableCache || new WeakMap;
    this.wasReachableCache = this.wasReachableCache || new WeakMap;

    // Close over owned values.
    var rootNode = this.rootNode;
    var parentChangeMap = this.parentChangeMap;
    var reachableCache = this.reachableCache;
    var wasReachableCache = this.wasReachableCache;

    // An node's oldParent is
    //   -its present parent, if nothing happened to it
    //   -null if the first thing that happened to it was an add.
    //   -the node it was removed from if the first thing that happened to it
    //      was a remove.
    function getOldParent(el) {
      var change = parentChangeMap.get(el);

      if (change) {
        if (change.oldParentNode)
          return change.oldParentNode;
        if (change.added)
          return null;
      }

      return el.parentNode;
    }

    // Is the given node reachable from the rootNode.
    function getIsReachable(el) {
      if (el === rootNode)
        return true;
      if (!el)
        return false;

      var isReachable = reachableCache.get(el);
      if (isReachable === undefined) {
        isReachable = getIsReachable(el.parentNode);
        reachableCache.set(el, isReachable);
      }
      return isReachable;
    }

    // Was the given node reachable from the rootNode.
    // A node wasReachable if its oldParent wasReachable.
    function getWasReachable(el) {
      if (el === rootNode)
        return true;
      if (!el)
        return false;

      var wasReachable = wasReachableCache.get(el);
      if (wasReachable === undefined) {
        wasReachable = getWasReachable(getOldParent(el));
        wasReachableCache.set(el, wasReachable);
      }
      return wasReachable;
    }

    if (getIsReachable(el))
      return getWasReachable(el) ? STAYED_REACHABLE : ADDED;
    else
      return getWasReachable(el) ? REMOVED : STAYED_UNREACHABLE;
  },

  /**
   * Fast implemention: visit the list of nodes which were added or removed
   * in any mutation and return the set whose parentNode is now different
   * from its previous parentNode.
   *
   * Complexity: O(a)
   *   a: The number of node removals and additions which have occurred.
   *
   * @return {Array} An array of nodes which have a new parentNode.
   */
  getChangedParent: function() {
    this.processMutations();

    return this.affectedChildren.filter(function(el) {
      var change = this.parentChangeMap.get(el);

      if (!change.added && !change.oldParentNode)
        return false;  // Node started out and ended up unparented.

      if (change.oldParentNode == el.parentNode)
        return false;  // Node was removed and ultimately returned to the same parent.

      if (this.reachabilityChange(el) != STAYED_REACHABLE)
        return false;  // Node was added, removed or never was in the document.

      return true;
    }, this);
  },

  /**
   * Fast implemention of both getAdded and getRemoved: visit the list of nodes
   * which were added or removed and any present descendants. For all nodes
   * visited, check its reachability change.
   *
   * Complexity: O(log n * (a + d))
   *   n: The number of nodes in the fragment.
   *   a: The number of node removals and additions which have occurred.
   *   d: The number of nodes which descend from nodes which were added or removed.
   *
   * @return {Array} An array of nodes matching |changeType|.
   */
  getChangedOfType: function(changeType) {
    this.processMutations();

    var changed = [];
    var reachabilityChange = this.reachabilityChange.bind(this);
    var visited = new WeakMap;

    function maybeAddNode(node) {
      if (visited.has(node) ||
          reachabilityChange(node) != changeType)
        return;

      changed.push(node);
      visited.set(node, true);

      for (var i = 0; i < node.childNodes.length; i++) {
        maybeAddNode(node.childNodes[i]);
      }
    }

    this.affectedChildren.forEach(maybeAddNode);
    return changed;
  },

  /** Which nodes were not reachable from the rootNode in the previous state,
   * but now are?
   *
   * See getChangedOfType, above.
   */
  getAdded: function() {
    return this.getChangedOfType(ADDED);
  },

  /**
   * Which nodes are now reachable from the rootNode, but were not in the
   * previous state?
   *
   * See getChangedOFType, above.
   */
  getRemoved: function() {
    return this.getChangedOfType(REMOVED);
  },

  /**
   * Fast implemention: visit the list of mutations which altered a nodes
   * childlist. For each, merge the mutation as a "splice" record into
   * the node's spliceList. (see comments above mergeSplice).
   *
   * Complexity: O(o^2 + e^2)
   *   o: The number of operations which affected a sequence of a node's
   *      childlist.
   *   e: The average continuous run of inserted or moved nodes within
   *      a node's childlist which resulted from o.
   */
  getChildlistChanges: function() {
    this.processMutations();

    // Project the mutations into splice lists for each affectedParent.
    if (!this.spliceMap) {
      var spliceMap = this.spliceMap = new WeakMap;

      this.mutations.forEach(function(mutation) {
        // Update the "splice projection" for this target.
        var splices = spliceMap.get(mutation.target);
        if (!splices) {
          splices = [];
          spliceMap.set(mutation.target, splices);
        }

        mergeSplice(splices, mutation);
      });
    }

    var changed = [];

    var reachabilityChange = this.reachabilityChange.bind(this);

    function processChildMutation(el) {
      changed.push(el);

      if (reachabilityChange(el) == ADDED)
        visitAffectedParent(el);
    }

    var visitedParents = new WeakMap;

    function visitAffectedParent(el) {
      if (visitedParents.has(el))
        return;
      visitedParents.set(el, true);

      var changeType = reachabilityChange(el);
      if (changeType == STAYED_UNREACHABLE ||
          changeType == REMOVED)
        return;

      if (changeType == ADDED) {
        // Visit all children.
        for (var i = 0; i < el.childNodes.length; i++)
          processChildMutation(el.childNodes[i]);
      } else {
        spliceMap.get(el).forEach(function(splice) {
          // We perform a final editDistance calculation so as to catch
          // the case that elements were effective re-arranged but moved
          // back into place. This is the (n ^ 2) component of the complexity
          // cost, above.
          calcSplices(el.childNodes,
                      splice.index,
                      splice.addCount,
                      splice.removed).forEach(function(splice) {
            for (var i = 0; i < splice.addCount; i++) {
              processChildMutation(el.childNodes[splice.index + i]);
            }
          });
        });
      }
    }

    this.affectedParents.forEach(visitAffectedParent);

    return changed;
  }
}

/**
 * Splice Projection functions:
 *
 * A splice map is a representation of how a previous array of items
 * was transformed into a new array of items. Conceptually it is a list of
 * tuples of
 *
 *   <index, removed, addCount>
 *
 * which are kept in ascending index order of. The tuple represents that at
 * the |index|, |removed| sequence of items were removed, and counting forward
 * from |index|, |addCount| items were added.
 */

function newSplice(index, removed, addCount) {
  return {
    index: index,
    removed: removed,
    addCount: addCount
  };
}

/**
 * Takes an existing set of splice tuples and merges in a new splice mutation
 * Note that the new splice mutation may:
 *
 *   -Need to be merged one or more splices in |splices| because it is adjacent,
 *    or overlaps.
 *   -Affect the index of one or more splices because it changed the number of
 *    items preceding them.
 *
 * Complexity: O(s)
 *   s: The number of |splices|.
 */
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

  var splice = newSplice(mutation.index,
                         mutation.removed,
                         mutation.added.length);

  var range = splice.index + splice.removed.length;
  var delta = splice.addCount - splice.removed.length;
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
      if (splice.index < current.index) {
        var spliceArgs = [current.index - splice.index,
                          intersectCount].concat(current.removed);
        Array.prototype.splice.apply(splice.removed, spliceArgs);
      } else {
        var spliceArgs = [splice.index - current.index,
                          intersectCount].concat(splice.removed);
        Array.prototype.splice.apply(current.removed, spliceArgs);
        splice.removed = current.removed;
        splice.index = Math.min(splice.index, current.index);
      }

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

/**
 * Lacking individual splice mutation information, the minimal set of
 * splices can be synthesized given the previous state and final state of an
 * array. The basic approach is to calculate the edit distance matrix and
 * choose the shortest path through it.
 *
 * Complexity: O(l * p)
 *   l: The length of the current array
 *   p: The length of the old array
 */
function calcSplices(current, currentIndex, currentLength, old) {
  var LEAVE = 0;
  var UPDATE = 1;
  var ADD = 2;
  var DELETE = 3;

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
  function calcEditDistances(current, currentIndex, currentLength, old) {
    // "Deletion" columns
    var distances = new Array(old.length + 1);

    // "Addition" rows. Initialize null column.
    for (var i = 0; i < distances.length; i++) {
      distances[i] = new Array(currentLength + 1)
      distances[i][0] = i;
    }

    // Initialize null row
    for (var j = 0; j < distances[0].length; j++) {
      distances[0][j] = j;
    }

    for (var i = 1; i < distances.length; i++) {
      for (var j = 1; j < distances[i].length; j++) {
        if (old[i - 1] === current[currentIndex + j - 1])
          distances[i][j] = distances[i - 1][j - 1];
        else
          distances[i][j] = Math.min(distances[i - 1][j] + 1,      // 1 Edit
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
    while (i > 0 || j > 0) {
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

      var min = Math.min(updateOrNoop, deletion, addition);
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

  var ops = operations(calcEditDistances(current,
                                         currentIndex,
                                         currentLength,
                                         old));

  var splice = undefined;
  var splices = [];
  var index = 0;
  var oldIndex = 0;
  for (var i = 0; i < ops.length; i++) {
    switch(ops[i]) {
      case LEAVE:
        if (splice) {
          splices.push(splice);
          splice = undefined;
        }

        index++;
        oldIndex++;
        break;
      case UPDATE:
        if (!splice)
          splice = newSplice(currentIndex + index, [], 0);

        splice.addCount++;
        index++;

        splice.removed.push(old[oldIndex]);
        oldIndex++;
        break;
      case ADD:
        if (!splice)
          splice = newSplice(currentIndex + index, [], 0);

        splice.addCount++;
        index++;
        break;
      case DELETE:
        if (!splice)
          splice = newSplice(currentIndex + index, [], 0);

        splice.removed.push(old[oldIndex]);
        oldIndex++;
        break;
    }
  }

  if (splice) {
    splices.push(splice);
  }

  return splices;
}