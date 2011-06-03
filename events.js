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

  if (!node.logs_[type])
    return;

  if (!node.logs_[type].length)
    return;

  var index = node.logs_.indexOf(log);
  if (index < 0)
    return;

  node.logs_[type].splice(index, 1);
}

types.forEach(function(type) {
  Node.prototype['add' + type + 'Listener'] = function(log) {
    addListener(this, type, log);
  };
  Node.prototype['remove' + type + 'Listener'] = function(log) {
    removeListener(this, type, log);
  };
});

function logMutations(node, localType, subtreeType, attrName) {
  var dirtyLogs = new WeakMap;
  var mutation = {target: node, type: localType || subtreeType};
  if (attrName)
    mutation.attrName = attrName;

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

  if (localType)
    logOneMutation(node, localType);
  while (node) {
    logOneMutation(node, subtreeType);
    node = node.parentNode;
  }
}

document.addEventListener('DOMNodeInserted', function(event) {
  logMutations(event.target.parentNode, 'ChildlistChanged', 'SubtreeChanged');
}, false);

document.addEventListener('DOMNodeRemoved', function(event) {
  logMutations(event.target.parentNode, 'ChildlistChanged', 'SubtreeChanged');
}, false);

document.addEventListener('DOMAttrModified', function(event) {
  logMutations(event.target,
               'AttributeChanged',
               'SubtreeAttributeChanged',
               event.attrName);
}, false);

document.addEventListener('DOMCharacterDataModified', function(event) {
  logMutations(event.target, null, 'TextDataChanged');
}, false);

})()
