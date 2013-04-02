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

(function(global) {
  'use strict';

  function assert(v) {
    if (!v)
      throw new Error('Assertion failed');
  }

  function isObject(value) {
    return Object(value) === value;
  }

  function toUint32(v) {
    return v >>> 0;
  }

  var forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);

  var templateAttributeDirectives = {
    'template': true,
    'iterate': true,
    'instantiate': true,
    'ref': true
  };

  var semanticTemplateElements = {
    'THEAD': true,
    'TBODY': true,
    'TFOOT': true,
    'TH': true,
    'TR': true,
    'TD': true,
    'COLGROUP': true,
    'COL': true,
    'OPTION': true
  };

  var hasTemplateElement = typeof HTMLTemplateElement !== 'undefined';

  var allTemplatesSelectors = 'template, ' +
      Object.keys(semanticTemplateElements).map(function(tagName) {
        return tagName.toLowerCase() + '[template]';
      }).join(', ');

  function getTemplateDescendentsOf(node) {
    return node.querySelectorAll(allTemplatesSelectors);
  }

  function isAttributeTemplate(el) {
    return semanticTemplateElements[el.tagName] &&
        el.hasAttribute('template');
  }

  function isTemplate(el) {
    return el.tagName == 'TEMPLATE' || isAttributeTemplate(el);
  }

  function isNativeTemplate(el) {
    return hasTemplateElement && el.tagName == 'TEMPLATE';
  }

  // FIXME: Observe templates being added/removed from documents
  // FIXME: Expose imperative API to decorate and observe templates in
  // "disconnected tress" (e.g. ShadowRoot)
  document.addEventListener('DOMContentLoaded', function(e) {
    bootstrapTemplatesRecursivelyFrom(document);
    Model.notifyChanges();
  }, false);

  function bootstrapTemplatesRecursivelyFrom(node) {
    function bootstrap(template) {
      if (!HTMLTemplateElement.decorate(template))
        bootstrapTemplatesRecursivelyFrom(template.content);
    }

    // Need to do this first as the contents may get lifted if |node| is
    // template.
    var templateDescendents = getTemplateDescendentsOf(node);
    if (isTemplate(node))
      bootstrap(node);

    forEach(templateDescendents, bootstrap);
  }

  if (!hasTemplateElement) {
    /**
     * This represents a <template> element.
     * @constructor
     * @extends {HTMLElement}
     */
    global.HTMLTemplateElement = function() {
      throw TypeError('Illegal constructor');
    };
  }

  var hasProto = '__proto__' in {};

  function mixin(to, from) {
    Object.getOwnPropertyNames(from).forEach(function(name) {
      Object.defineProperty(to, name,
                            Object.getOwnPropertyDescriptor(from, name));
    });
  }

  var templateContentsTable = new SideTable('templateContents');
  var templateContentsOwnerTable = new SideTable('templateContentsOwner');
  var templateInstanceRefTable = new SideTable('templateInstanceRef');

  // http://dvcs.w3.org/hg/webcomponents/raw-file/tip/spec/templates/index.html#dfn-template-contents-owner
  function getTemplateContentsOwner(doc) {
    if (!doc.defaultView)
      return doc;
    var d = templateContentsOwnerTable.get(doc);
    if (!d) {
      // TODO(arv): This should either be a Document or HTMLDocument depending
      // on doc.
      d = doc.implementation.createHTMLDocument('');
      while (d.lastChild) {
        d.removeChild(d.lastChild);
      }
      templateContentsOwnerTable.set(doc, d);
    }
    return d;
  }

  function cloneAndSeperateAttributeTemplate(templateElement) {
    var clone = templateElement.cloneNode(false);
    var attribs = templateElement.attributes;
    var count = attribs.length;
    while (count-- > 0) {
      var attrib = attribs[count];
      if (templateAttributeDirectives[attrib.name])
        clone.removeAttribute(attrib.name);
      else
        templateElement.removeAttribute(attrib.name);
    }

    return clone;
  }

  function liftNonNativeTemplateChildrenIntoContent(templateElement) {
    var content = templateElement.content;

    if (!isAttributeTemplate(templateElement)) {
      var child;
      while (child = templateElement.firstChild) {
        content.appendChild(child);
      }
      return;
    }

    // For attribute templates we copy the whole thing into the content and
    // we move the non template attributes into the content.
    //
    //   <tr foo template>
    //
    // becomes
    //
    //   <tr template>
    //   + #document-fragment
    //     + <tr foo>
    //
    var newRoot = cloneAndSeperateAttributeTemplate(templateElement);
    var child;
    while (child = templateElement.firstChild) {
      newRoot.appendChild(child);
    }
    content.appendChild(newRoot);
  }

  /**
   * Ensures proper API and content model for template elements.
   * @param {HTMLTemplateElement} opt_instanceRef The template element which
   *     |el| template element will return as the value of its ref(), and whose
   *     content will be used as source when createInstance() is invoked.
   */
  HTMLTemplateElement.decorate = function(el, opt_instanceRef) {
    if (el.templateIsDecorated_)
      return false;
    el.templateIsDecorated_ = true;

    fixTemplateElementPrototype(el);

    Model.enqueue(checkIteration.bind(null, el));

    // Create content
    if (!isNativeTemplate(el)) {
      var doc = getTemplateContentsOwner(el.ownerDocument);
      templateContentsTable.set(el, doc.createDocumentFragment());
    }

    if (opt_instanceRef) {
      templateInstanceRefTable.set(el, opt_instanceRef);
      return true; // content is empty.
    }

    if (isNativeTemplate(el)) {
      bootstrapTemplatesRecursivelyFrom(el.content);
    } else {
      liftNonNativeTemplateChildrenIntoContent(el);
    }

    return true;
  };

  // TODO(rafaelw): This used to decorate recursively all templates from a given
  // node. This happens by default on 'DOMContentLoaded', but may be needed
  // in subtrees not descendent from document (e.g. ShadowRoot).
  // Review whether this is the right public API.
  HTMLTemplateElement.bootstrap = bootstrapTemplatesRecursivelyFrom;

  var htmlElement = global.HTMLUnknownElement || HTMLElement;

  var contentDescriptor = {
    get: function() {
      return templateContentsTable.get(this);
    },
    enumerable: true,
    configurable: true
  };

  if (!hasTemplateElement) {
    // Gecko is more picky with the prototype than WebKit. Make sure to use the
    // same prototype as created in the constructor.
    HTMLTemplateElement.prototype = Object.create(htmlElement.prototype);

    Object.defineProperty(HTMLTemplateElement.prototype, 'content',
                          contentDescriptor);
  }

  function fixTemplateElementPrototype(el) {
    // Note: because we need to treat some semantic elements as template
    // elements (like tr or td), but don't want to reassign their proto (gecko
    // doesn't like that), we mixin the properties for those elements.
    if (el.tagName === 'TEMPLATE') {
      if (!hasTemplateElement) {
        if (hasProto)
          el.__proto__ = HTMLTemplateElement.prototype;
        else
          mixin(el, HTMLTemplateElement.prototype);
      }
    } else {
      mixin(el, HTMLTemplateElement.prototype);
      // FIXME: Won't need this when webkit methods move to the prototype.
      Object.defineProperty(el, 'content', contentDescriptor);
    }
  }

  function createInstance(element, model, modelDelegate) {
    var content = element.ref ? element.ref.content : element.content;
    return createDeepCloneAndDecorateTemplates(content);
  }

  mixin(HTMLTemplateElement.prototype, {

    createInstance: function(model, modelDelegate) {
      return createInstance(this, model, modelDelegate);
    },

    get instantiate() {
      return this.getAttribute('instantiate');
    },

    set instantiate(instantiate) {
      var oldVal = this.instantiate;
      if (instantiate == null)
        this.removeAttribute('instantiate');
      else
        this.setAttribute('instantiate', instantiate);
      if (instantiate != oldVal) {
        this.removeAttribute('iterate');
        Model.enqueue(checkIteration.bind(null, this));
      }
    },

    get iterate() {
      return this.getAttribute('iterate');
    },

    set iterate(iterate) {
      var oldVal = this.iterate;
      if (iterate == null)
        this.removeAttribute('iterate');
      else
        this.setAttribute('iterate', iterate);
      if (iterate != oldVal) {
        this.removeAttribute('instantiate');
        Model.enqueue(checkIteration.bind(null, this));
      }
    },

    get ref() {
      var ref;
      var refId = this.getAttribute('ref');
      if (refId)
        ref = this.ownerDocument.getElementById(refId);

      if (!ref)
        ref = templateInstanceRefTable.get(this);

      return ref || null;
    }
  });

  function parseSinglePathFromPlaceholder(input, startIndex) {
    assert(input.indexOf("{{") >= 0);
    assert(input.indexOf("}}") >= 0);
    var indexAfterBraces = startIndex + 2;
    var endIndex = input.indexOf("}}", indexAfterBraces);
    return input.slice(indexAfterBraces, endIndex).trim();
  }

  function isCheckBoxOrRadioButton(element) {
    return element.type === 'radio' || element.type === 'checkbox';
  }

  function addElementBindings(element) {
    assert(element);
    if (!element.hasAttributes())
      return;

    for (var i = 0; i < element.attributes.length; i++) {
      var attr = element.attributes[i];
      var index = attr.value.indexOf('{{');
      if (index !== -1 && attr.value.indexOf('}}', index) !== -1) {
        if (element.tagName === 'INPUT') {
          if (attr.name == 'value') {
            var value = attr.value;
            element.removeAttribute('value');
            element.addValueBinding(
                parseSinglePathFromPlaceholder(value, index));
          } else if (attr.name == 'checked' &&
                     isCheckBoxOrRadioButton(element)) {
            var value = attr.value;
            element.removeAttribute('checked');
            element.addCheckedBinding(
                parseSinglePathFromPlaceholder(value, index));
          } else {
            element.addBinding(attr.name, attr.value);
          }
        } else {
          element.addBinding(attr.name, attr.value);
        }
      }
    }
  }

  function addTextNodeBinding(text) {
    assert(text);
    var index = text.data.indexOf('{{');
    if (index !== -1 && text.data.indexOf('}}', index + 2))
      text.addBinding(text.data);
  }

  function addBindings(node) {
    assert(node);

    if (node.nodeType === Node.ELEMENT_NODE)
      addElementBindings(node);
    else if (node.nodeType === Node.TEXT_NODE)
      addTextNodeBinding(node);

    for (var child = node.firstChild; child ; child = child.nextSibling)
      addBindings(child);
  }

  function removeAllBindingsRecursively(node) {
    // All the remove methods checks if there is a binding for that
    // attribute/value/textContent.
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        node.removeBinding();
        break;
      case Node.ELEMENT_NODE:
        if (node.tagName === 'INPUT') {
          node.removeValueBinding();
          node.removeCheckedBinding();
        }
        var length = node.attributes.length;
        for (var i = 0; i < length; i++) {
          node.removeBinding(node.attributes[i]);
        }
        break;
    }

    for (var child = node.firstChild; child; child = child.nextSibling) {
      removeAllBindingsRecursively(child);
    }
  }

  function createDeepCloneAndDecorateTemplates(node) {
    var clone = node.cloneNode(false);  // Shallow clone.
    if (isTemplate(clone))
      HTMLTemplateElement.decorate(clone, node);

     for (var child = node.firstChild; child; child = child.nextSibling) {
      clone.appendChild(createDeepCloneAndDecorateTemplates(child))
    }
    return clone;
  }

  function removeChild(parent, child) {
    if (isTemplate(child)) {
      // Make sure we stop observing when we remove an element.
      var templateIterator = templateIteratorTable.get(child);
      if (templateIterator) {
        // TODO(rafaelw): templateIterator.clear()?
        templateIteratorTable.delete(child);
      }
    }
    parent.removeChild(child);
    removeAllBindingsRecursively(child);
    child.model = child.modelDelegate = undefined;
  }

  function InstanceCursor(templateElement, opt_index) {
    this.template_ = templateElement;
    this.previousTerminator_ = null;
    this.previousIndex_ = -1;
    this.terminator_ = templateElement;
    this.index_ = 0;

    if (!opt_index)
      return;

    while (opt_index-- > 0) {
      this.next();
    }
  }

  InstanceCursor.prototype = {
    next: function() {
      this.previousTerminator_ = this.terminator_;
      this.previousIndex_ = this.index_;
      this.index_++;

      while (this.index_ > instanceTerminatorCount(this.terminator_)) {
        this.index_ -= instanceTerminatorCount(this.terminator_);
        this.terminator_ = this.terminator_.nextSibling;
        if (this.terminator_.tagName === 'TEMPLATE')
          this.index_ += instanceCount(this.terminator_);
      }
    },

    abandon: function() {
      assert(instanceCount(this.template_));
      assert(instanceTerminatorCount(this.terminator_));
      assert(this.index_);

      decrementInstanceTerminatorCount(this.terminator_);
      this.index_--;
    },

    insert: function(model) {
      assert(this.template_.parentNode);

      this.previousTerminator_ = this.terminator_;
      this.previousIndex_ = this.index_;
      this.index_++;

      var instance = createInstance(this.template_);
      for (var child = instance.firstChild; child; child = child.nextSibling) {
        child.model = model;
        // FIXME: Is it neccessary to hard-set modelDelegate?
        child.modelDelegate = this.template_.parentNode.modelDelegate;
      }
      addBindings(instance);

      this.terminator_ = instance.lastChild || this.previousTerminator_;
      this.template_.parentNode.insertBefore(instance,
          this.previousTerminator_.nextSibling);

      incrementInstanceTerminatorCount(this.terminator_);
      if (this.terminator_ !== this.previousTerminator_) {
        while (instanceTerminatorCount(this.previousTerminator_) >
                this.previousIndex_) {
          decrementInstanceTerminatorCount(this.previousTerminator_);
          incrementInstanceTerminatorCount(this.terminator_);
        }
      }
    },

    remove: function() {
      assert(this.previousIndex_ !== -1);
      assert(this.previousTerminator_ &&
             (this.previousIndex_ > 0 ||
              this.previousTerminator_ === this.template_));
      assert(this.terminator_ && this.index_ > 0);
      assert(this.template_.parentNode);
      assert(instanceCount(this.template_));

      if (this.previousTerminator_ === this.terminator_) {
        assert(this.index_ == this.previousIndex_ + 1);
        decrementInstanceTerminatorCount(this.terminator_);
        this.terminator_ = this.template_;
        this.previousTerminator_ = null;
        this.previousIndex_ = -1;
        return;
      }

      decrementInstanceTerminatorCount(this.terminator_);

      var parent = this.template_.parentNode;
      while (this.previousTerminator_.nextSibling !== this.terminator_) {
        removeChild(parent, this.previousTerminator_.nextSibling);
      }
      removeChild(parent, this.terminator_);

      this.terminator_ = this.previousTerminator_;
      this.index_ = this.previousIndex_;
      this.previousTerminator_ = null;
      this.previousIndex_ = -1;  // 0?
    }
  };

  var ONE_WAY = DelegatedValueBinding.Type.ONE_WAY;

  function TemplateIterator(templateElement, bindingText, isIterate) {
    this.templateElement_ = templateElement;
    this.binding_ = new DelegatedValueBinding(templateElement.model,
                                              templateElement.modelDelegate,
                                              bindingText, ONE_WAY, this);
    this.bindingText_ = bindingText;
    this.isIterate_ = isIterate;

    this.iteratedValue = undefined;
    this.observing = false;
    this.instanceCount = 0;

    this.boundHandleSplices = this.handleSplices.bind(this);
    this.valueChanged(this.binding_);
  }

  TemplateIterator.prototype = {
    get bindingText() {
      return this.bindingText_;
    },

    get isIterate() {
      return this.isIterate_;
    },

    valueChanged: function(binding) {
      this.clear();

      if (this.binding_.value == null)
        return;

      if (this.isIterate_ && !Array.isArray(this.binding_.value))
        return;

      this.iteratedValue = this.isIterate_ ?
          this.binding_.value : [this.binding_.value];

      if (this.isIterate_) {
        Model.observeArray(this.iteratedValue, this.boundHandleSplices);
        this.observing = true;
      }

      this.handleSplices([{
        index: 0,
        addedCount: this.iteratedValue.length,
        removed: []
      }]);
    },

    handleSplices: function(splices) {
      splices.forEach(function(splice) {
        splice.removed.forEach(function() {
          var cursor = new InstanceCursor(this.templateElement_, splice.index + 1);
          cursor.remove();
          this.instanceCount--;
        }, this);

        var addIndex = splice.index;
        for (; addIndex < splice.index + splice.addedCount; addIndex++) {
          var cursor = new InstanceCursor(this.templateElement_, addIndex);
          cursor.insert(this.iteratedValue[addIndex]);
          this.instanceCount++;
        }
      }, this);
    },

    setModel: function(model) {
      if (this.binding_.setModel(model)) {
        this.valueChanged(this.binding_);
        return true;
      }

      return false;
    },

    setDelegate: function(model, delegate) {
      if (this.binding_.setDelegate(model, delegate)) {
        this.valueChanged(this.binding_);
        return true;
      }

      return false;
    },

    clear: function() {
      if (this.observing) {
        Model.unobserveArray(this.iteratedValue, this.boundHandleSplices)
        this.observing = false;
      }

      this.iteratedValue = undefined;
      if (!this.instanceCount)
        return;

      for (var i = 0; i < this.instanceCount; i++) {
        var cursor = new InstanceCursor(this.templateElement_, 1);
        cursor.remove();
      }

      this.instanceCount = 0;
    }
  };

  var templateIteratorTable = new SideTable('templateIterator');

  function instanceCount(element) {
    var templateIterator = templateIteratorTable.get(element);
    return templateIterator ? templateIterator.instanceCount : 0;
  }

  function checkIteration(element) {
    var bindingText;
    var isIterate = false;
    if (element.parentNode && element.ownerDocument.defaultView) {
      bindingText = element.getAttribute('instantiate');
      if (bindingText === null) {
        isIterate = true;
        bindingText = element.getAttribute('iterate');
      }
    }

    var templateIterator = templateIteratorTable.get(element);
    if (templateIterator &&
        templateIterator.bindingText === element.bindingText &&
        templateIterator.isIterate === isIterate) {
      return;
    }

    if (templateIterator) {
      templateIterator.clear();
      templateIteratorTable.delete(element);
    }

    if (bindingText == null)
      return;

    templateIterator = new TemplateIterator(element, bindingText, isIterate);
    templateIteratorTable.set(element, templateIterator);
  }

  modelChangedTable.set(HTMLTemplateElement.prototype, function() {
    modelChangedTable.get(Element.prototype).call(this);
    var templateIterator = templateIteratorTable.get(this);
    if (templateIterator)
      Model.enqueue(lazyModelChanged.bind(this));
  });

  modelDelegateChangedTable.set(HTMLTemplateElement.prototype, function() {
    modelDelegateChangedTable.get(Element.prototype).call(this);
    var templateIterator = templateIteratorTable.get(this);
    if (templateIterator)
      Model.enqueue(lazyModelDelegateChanged.bind(this));
  });

  function lazyModelChanged() {
    var templateIterator = templateIteratorTable.get(this);
    if (templateIterator)
      templateIterator.setModel(this.model);
  }

  function lazyModelDelegateChanged() {
    var templateIterator = templateIteratorTable.get(this);
    if (templateIterator)
      templateIterator.setDelegate(this.model, this.modelDelegate);
  }

  // TODO(arv): Consider storing all "NodeRareData" on a single object?
  function InstanceTerminatorCount() {
    this.instanceTerminatorCount_ = 0;
  }

  InstanceTerminatorCount.prototype = {
    instanceTerminatorCount: function() {
      return this.instanceTerminatorCount_;
    },
    incrementInstanceTerminatorCount: function() {
      this.instanceTerminatorCount_++;
    },
    decrementInstanceTerminatorCount: function() {
      this.instanceTerminatorCount_--;
    },
  };

  var instanceTerminatorCountTable = new SideTable('instanceTerminatorCount');

  function ensureInstanceTerminatorCount(node) {
    var count = instanceTerminatorCountTable.get(node);
    if (!count) {
      count = new InstanceTerminatorCount();
      instanceTerminatorCountTable.set(node, count);
    }
    return count;
  }

  function incrementInstanceTerminatorCount(node) {
    ensureInstanceTerminatorCount(node).incrementInstanceTerminatorCount();
  }

  function decrementInstanceTerminatorCount(node){
    ensureInstanceTerminatorCount(node).decrementInstanceTerminatorCount();
  }

  function instanceTerminatorCount(node) {
    var data = instanceTerminatorCountTable.get(node);
    return data ? data.instanceTerminatorCount() : 0;
  }

  // Expose for testing
  HTMLTemplateElement.allTemplatesSelectors = allTemplatesSelectors;

})(this);
