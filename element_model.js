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

var getModelOwnerAndPath;
var clearModelOwnerAndPathCache;

(function() {

var observableObjects = !!Object.getObservable;

function handleDomNodeInserted(e) {
  // All bindings should have their source set at the root node, if they
  // are in need of an inherited model
  if (e.target.model_ === undefined)
    resetBindingSources(e.target);
}

function handleDomNodeRemoved(e) {
  // It is safe to exit early if there is no modelOwner_ reference set on
  // the target node. This will always mean that there are zero bindings at
  // this node or below.
  if (!e.target.modelOwner_)
    return;
  e.target.isBeingRemoved_ = true;
  var ownerAndPath = getModelOwnerAndPath(e.currentTarget);
  var path = Path.join(ownerAndPath[1], e.target.templateScope_);

  clearModelOwnerAndPathCache(e.target);
  resetBindingSources(ownerAndPath[0], path);
  e.target.isBeingRemoved_ = false;
}

/**
 * Call resetPaths on each of an array of BindingSources, optionally only
 * including those that start with the provided path.
 * @param {Node} owner The owner of the bindingSources to be reset.
 * @param {Path} opt_path If included, the path prefix to match against the
 *     BindingSource's pathToOwner
 */
function resetBindingSources(owner, opt_path) {
  if (!owner.boundSources_)
    return;

  var sources = owner.boundSources_;

  if (opt_path) {
    // TODO(rafaelw): Considering refactoring. We need to prepend 'model'
    // here because this path is the path to the owner element, not including
    // its model property.
    opt_path = Path.join('model', opt_path);
    sources = sources.filter(function(source) {
      return source.pathToOwner.startsWith(opt_path);
    });
  }

  var ownerCacheToken = {};

  sources.concat().forEach(function(source) {
    // We only reset paths if the source still points to owner. An earlier
    // source.resetPaths can affect later ones (notably in the case of the path
    // change to an array causing the template iterator to destroy template
    // instances).
    if (source.modelOwner == owner)
      source.resetPaths(ownerCacheToken);
  });
}

function setModel(model) {
  if (model === this.model_)
    return;

  // If model is set to undefined we can stop listening at this level.
  if (model === undefined) {
    this.removeEventListener('DOMNodeInserted', handleDomNodeInserted, true);
    this.removeEventListener('DOMNodeRemoved', handleDomNodeRemoved, true);
  } else {
    // Since we are reusing the function here duplicate add will be ignored.
    this.addEventListener('DOMNodeInserted', handleDomNodeInserted, true);
    this.addEventListener('DOMNodeRemoved', handleDomNodeRemoved, true);
  }

  var ownerAndPath;
  var oldModel = this.model_;
  if (oldModel === undefined)
    ownerAndPath = getModelOwnerAndPath(this);

  this.model_ = model;

  // Notify listeners. This will be a noop because of first check in this
  // function.
  this.model = model;

  if (this.model_ === undefined)
    resetBindingSources(this);
  else if (oldModel === undefined)
    resetBindingSources(ownerAndPath[0], ownerAndPath[1]);
}

function getModel() {
  var model;
  if (this.model_ !== undefined)
    model = this.model_;
  else if (this.parentNode)
    model = this.parentNode.model;

  if (!model)
    return undefined;

  return Model.getValueAtPath(model, this.templateScope_);
}

var modelDescriptor = {
  configurable: true,
  enumerable: true,
  get: getModel,
  set: setModel,
};

Object.defineProperty(HTMLElement.prototype, 'model', modelDescriptor);
Object.defineProperty(Text.prototype, 'model',  modelDescriptor);

function setTemplateScope(templateScope) {
  var oldTemplateScope = this.templateScope__;
  templateScope = String(templateScope);
  if (templateScope !== oldTemplateScope) {
    var ownerAndPath = getModelOwnerAndPath(this, true);  // excludeLocalScope
    var owner = ownerAndPath[0];
    var path = Path.join(ownerAndPath[1], oldTemplateScope);

    this.templateScope__ = templateScope;

    // We only reset our bindings if the templateScope has changed,
    // and avoid setting it on initialization. On initialization, bindings
    // will always be added after templateScope is set, so this is ok.
    // templateScope should never be unset.
    if (oldTemplateScope)
      resetBindingSources(owner, path);
  }
}

function getTemplateScope() {
  return this.templateScope__ || '';
}

Object.defineProperty(HTMLElement.prototype, 'templateScope_', {
  configurable: true,
  enumerable: true,
  set: setTemplateScope,
  get: getTemplateScope
});

Object.defineProperty(Text.prototype, 'templateScope_', {
  configurable: true,
  enumerable: true,
  set: setTemplateScope,
  get: getTemplateScope
});

function hasOwnModel(node) {
  return node.model_ !== undefined;
}

function forEachBinding(node, f) {
  function filter(n) {
    // If the node has an own model then we do not need to update it unless it
    // is the root of the tree we are resetting.
    return n != node && hasOwnModel(n) ?
        NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
  }
  var iterator = node.ownerDocument.createTreeWalker(
      node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter, false);

  for (var n = iterator.currentNode; n; n = iterator.nextNode()) {
    var bindings = n.bindings_;
    for (var p in bindings) {
      f(bindings[p]);
    }
  }
}

function isModelOwner(element) {
  // Note: isBeingRemoved_ is set (and later unset) in handleDomNodeRemoved.
  // Because the DOMNodeRemoved event is fired synchronously we need to
  // treat that node as not having a parent (because it shortly will not).
  return hasOwnModel(element) ||
         !element.parentNode ||
         element.isBeingRemoved_;
}

/**
 * Returns the first ancestor that owns a model and the transitive path to it.
 * @param {Node} element The node that we start from.
 * @param {boolean} excludeLocalScope Do not include any path scoping on the
 *     passed element (templateScope_)
 * @param {Object} ownerCacheToken If present, is the object which must be
 *     identical to a stored ownerCacheToken_ on the element for its modelOwner_
 *     cache to be considered valid.
 * @return {Array} An array with two items. Item one is the model owner and the
 *     second item is the transitive path.
 */
getModelOwnerAndPath = function(element,
                                excludeLocalScope,
                                ownerCacheToken) {
  var localPath;
  if (excludeLocalScope) {
    localPath = '';
  } else {
    localPath = element.templateScope_;
  }

  if (isModelOwner(element))
    return [element, localPath];

  if (!element.modelOwner_ ||
      (ownerCacheToken && this.ownerCacheToken_ !== ownerCacheToken)) {
    var ownerAndPath = getModelOwnerAndPath(element.parentNode,
                                            false,  // excludeLocalScope
                                            ownerCacheToken);
    element.modelOwner_ = ownerAndPath[0];
    element.pathToOwner_ = ownerAndPath[1];
    element.ownerCacheToken_ = ownerCacheToken;
  }

  return [element.modelOwner_, Path.join(element.pathToOwner_, localPath)];
};

clearModelOwnerAndPathCache = function(element) {
  if (isModelOwner(element))
    return;

  element.modelOwner_ = null;
  element.pathToOwner_ = null;
  element.ownerCacheToken_ = null;
  clearModelOwnerAndPathCache(element.parentNode);
};

function hasOwnModelDelegate(node) {
  return node.modelDelegate_ !== undefined;
}

var modelDelegateDescriptor = {
  get: function() {
    for (var node = this; node; node = node.parentNode) {
      if (hasOwnModelDelegate(node))
        return node.modelDelegate_;
    }
    return undefined;
  },
  set: function(modelDelegate) {
    if (this.modelDelegate_ !== modelDelegate) {
      this.modelDelegate_ = modelDelegate;
      var ownerAndPath = getModelOwnerAndPath(this,
                                              false);  // excludeLocalScope
      var owner = ownerAndPath[0];
      var path = ownerAndPath[1];
      resetBindingSources(owner, path);
    }
  },
  configurable: true,
  enumerable: true
};

Object.defineProperty(Element.prototype, 'modelDelegate',
                      modelDelegateDescriptor);
Object.defineProperty(Text.prototype, 'modelDelegate',
                      modelDelegateDescriptor);

})();
