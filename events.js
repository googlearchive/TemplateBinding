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

// Below is an implementation of Jonas Sicking's proposal
// for replacing mutation events:
//
// http://www.w3.org/2008/webapps/wiki/MutationReplacement
//
// and elaborated on here:
//
// http://lists.w3.org/Archives/Public/public-webapps/2009AprJun/0779.html
//
// The big difference is that callbacks are replaced by MutationLogs.
//
// Other differences from the spec:
//   - For ChildlistChanged mutations, the nodes added and/or removed are
//     included in the mutation.
//   - For AttributeChanged mutations, the changed attribute name is included.

(function() {

/**
 * Each of these is available as addXXXListener/removeXXXListener methods
 * on Nodes.
 */
var types = [
    'AttributeChanged',
    'SubtreeAttributeChanged',
    'ChildlistChanged',
    'SubtreeChanged',
    'TextDataChanged'
];

function addListener(node, type, log) {
  if (!MutationLog.verify(log))
    return;
  node.logs_ = node.logs_ || {};
  node.logs_[type] = node.logs_[type] || [];
  if (node.logs_[type].indexOf(log) < 0)
    node.logs_[type].push(log);
}

function removeListener(node, type, log) {
  if (!node.logs_)
    return;

  var logs = node.logs_[type];
  if (!logs || !logs.length)
    return;

  var index = logs.indexOf(log);
  if (index < 0)
    return;

  logs.splice(index, 1);
}

types.forEach(function(type) {
  Node.prototype['add' + type + 'Listener'] = function(log) {
    addListener(this, type, log);
  };
  Node.prototype['remove' + type + 'Listener'] = function(log) {
    removeListener(this, type, log);
  };
});

function logMutations(mutation, localType, subtreeType) {
  var dirtyLogs = new WeakMap;

  function logOneMutation(node, listenerType) {
    if (node.logs_ && node.logs_[listenerType]) {
      node.logs_[listenerType].forEach(function(log) {
        if (!dirtyLogs.get(log)) {
          log.append(mutation);
          dirtyLogs.set(log, true);
        }
      });
    }
  }

  var node = mutation.target;
  if (localType)
    logOneMutation(node, localType);
  while (node) {
    logOneMutation(node, subtreeType);
    node = node.parentNode;
  }
}

document.addEventListener('DOMNodeInserted', function(event) {
  var mutation = {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    added: [event.target],
    removed: []
  };
  logMutations(mutation, 'ChildlistChanged', 'SubtreeChanged');
}, false);

document.addEventListener('DOMNodeRemoved', function(event) {
  var mutation = {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    added: [],
    removed: [event.target]
  };
  logMutations(mutation, 'ChildlistChanged', 'SubtreeChanged');
}, false);

document.addEventListener('DOMAttrModified', function(event) {
  var mutation = {
    target: event.target,
    type: 'AttributeChanged',
    attrName: event.attrName
  };
  logMutations(mutation, 'AttributeChanged', 'SubtreeAttributeChanged');
}, false);

document.addEventListener('DOMCharacterDataModified', function(event) {
  var mutation = {
    target: event.target,
    type: 'TextDataChanged'
  };
  logMutations(mutation, null, 'TextDataChanged');
}, false);

})()
