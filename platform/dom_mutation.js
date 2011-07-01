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

function addListener(node, type, observer) {
  node.observers_ = node.observers_ || {};
  node.observers_[type] = node.observers_[type] || [];
  if (node.observers_[type].indexOf(observer) < 0) {
    node.observers_[type].push(observer);

    switch (type) {
      case 'AttributeChanged':
      case 'SubtreeAttributeChanged':
        node.addEventListener('DOMAttrModified', attrHandler, false);
        break;
      case 'ChildlistChanged':
      case 'SubtreeChanged':
        node.addEventListener('DOMNodeInserted', addHandler, false);
        node.addEventListener('DOMNodeRemoved', removeHandler, false);
        break;
      case 'TextDataChanged':
        node.addEventListener('DOMCharacterDataModified',
                              charDataHandler, false);
        break;
    }
  }
}

function removeListener(node, type, observer) {
  if (!node.observers_)
    return;

  var observers = node.observers_[type];
  if (!observers || !observers.length)
    return;

  var index = observers.indexOf(observer);
  if (index < 0)
    return;

  observers.splice(index, 1);
  if (!observers.length) {
    switch (type) {
      case 'AttributeChanged':
      case 'SubtreeAttributeChanged':
        node.removeEventListener('DOMAttrModified', attrHandler, false);
        break;
      case 'ChildlistChanged':
      case 'SubtreeChanged':
        node.removeEventListener('DOMNodeInserted', addHandler, false);
        node.removeEventListener('DOMNodeRemoved', removeHandler, false);
        break;
      case 'TextDataChanged':
        node.removeEventListener('DOMCharacterDataModified',
                                 charDataHandler, false);
        break;
    }
  }
}

types.forEach(function(type) {
  Node.prototype['add' + type + 'Listener'] = function(observer) {
    addListener(this, type, observer);
  };
  Node.prototype['remove' + type + 'Listener'] = function(observer) {
    removeListener(this, type, observer);
  };
});

function logMutations(event, mutation, localType, subtreeType) {
  var notifiedObservers = getNotifiedObservers(event);
  function logOneMutation(node, listenerType) {
    if (node.observers_ && node.observers_[listenerType]) {
      node.observers_[listenerType].forEach(function(observer) {
        if (!notifiedObservers.get(observer)) {
          window.enqueueMutation_(observer, mutation);
          notifiedObservers.set(observer, true);
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

// A WeakMap of Event -> Set (WeakMap) of Observers which have been notified of
// |Event|.
// TODO(adamk): Use a different solution, since this will be deathly
// slow without a native WeakMap.
var notifiedObserversMap = new WeakMap;
function getNotifiedObservers(event) {
  var notifiedObservers = notifiedObserversMap.get(event);
  if (!notifiedObservers) {
    notifiedObservers = new WeakMap;
    notifiedObserversMap.set(event, notifiedObservers);
  }
  return notifiedObservers;
}

function addHandler(event) {
  var mutation = {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    added: [event.target],
    removed: []
  };
  logMutations(event, mutation, 'ChildlistChanged', 'SubtreeChanged');
}

function removeHandler(event) {
  var mutation = {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    added: [],
    removed: [event.target]
  };
  logMutations(event, mutation, 'ChildlistChanged', 'SubtreeChanged');
}

function attrHandler(event) {
  var mutation = {
    target: event.target,
    type: 'AttributeChanged',
    attrName: event.attrName
  };
  logMutations(event, mutation, 'AttributeChanged', 'SubtreeAttributeChanged');
}

function charDataHandler(event) {
  var mutation = {
    target: event.target,
    type: 'TextDataChanged'
  };
  logMutations(event, mutation, null, 'TextDataChanged');
}

})()
