// Copyright 2013 Google Inc.
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

(function() {
  'use strict';

  function bindNode(name, model, path) {
    console.error('Unhandled binding to Node: ', this, name, model, path);
  }

  function unbindNode(name) {}
  function unbindAllNode() {}

  Node.prototype.bind = bindNode;
  Node.prototype.unbind = unbindNode;
  Node.prototype.unbindAll = unbindAllNode;

  var textContentBindingTable = new SideTable('textContentBinding');

  function Binding(model, path, changed) {
    this.model = model;
    this.path = path;
    this.changed = changed;

    var value = Model.observePath(this.model, this.path, this.changed);
    this.changed(value);
  }

  Binding.prototype = {
    unbind: function() {
      // TODO(rafaelw): Tell bound object to unbind();
      Model.unobservePath(this.model, this.path, this.changed);
    },

    set value(newValue) {
      Model.setValueAtPath(this.model, this.path, newValue);
    }
  }

  function boundSetTextContent(textNode) {
    return function(value) {
      textNode.data = value;
    };
  }

  function bindText(name, model, path) {
    if (name !== 'textContent')
      return Node.prototype.bind.call(this, name, model, path);

    this.unbind('textContent');
    var binding = new Binding(model, path, boundSetTextContent(this));
    textContentBindingTable.set(this, binding);
  }

  function unbindText(name) {
    if (name != 'textContent')
      return Node.prototype.unbind.call(this, name);

    var binding = textContentBindingTable.get(this);
    if (!binding)
      return;

    binding.unbind();
    textContentBindingTable.delete(this);
  }

  function unbindAllText() {
    this.unbind('textContent');
    Node.prototype.unbindAll.call(this);
  }

  Text.prototype.bind = bindText;
  Text.prototype.unbind = unbindText;
  Text.prototype.unbindAll = unbindAllText;

  var attributeBindingsTable = new SideTable('attributeBindings');

  function boundSetAttribute(element, attributeName, conditional) {
    if (conditional) {
      return function(value) {
        if (!value)
          element.removeAttribute(attributeName);
        else
          element.setAttribute(attributeName, '');
      };
    }

    return function(value) {
      element.setAttribute(attributeName,
                           String(value === undefined ? '' : value));
    };
  }

  function ElementAttributeBindings() {
    this.bindingMap = Object.create(null);
  }

  ElementAttributeBindings.prototype = {
    add: function(element, attributeName, model, path) {
      element.removeAttribute(attributeName);
      var conditional = attributeName[attributeName.length - 1] == '?';
      if (conditional)
        attributeName = attributeName.slice(0, -1);

      this.remove(attributeName);

      var binding = new Binding(model, path,
          boundSetAttribute(element, attributeName, conditional));

      this.bindingMap[attributeName] = binding;
    },

    remove: function(attributeName) {
      var binding = this.bindingMap[attributeName];
      if (!binding)
        return;

      binding.unbind();
      delete this.bindingMap[attributeName];
    },

    removeAll: function() {
      Object.keys(this.bindingMap).forEach(function(attributeName) {
        this.remove(attributeName);
      }, this);
    }
  };

  function bindElement(name, model, path) {
    var bindings = attributeBindingsTable.get(this);
    if (!bindings) {
      bindings = new ElementAttributeBindings();
      attributeBindingsTable.set(this, bindings);
    }

    // ElementAttributeBindings takes care of removing old binding as needed.
    bindings.add(this, name, model, path);
  }

  function unbindElement(name) {
    var bindings = attributeBindingsTable.get(this);
    if (bindings)
      bindings.remove(name);
  }

  function unbindAllElement(name) {
    var bindings = attributeBindingsTable.get(this);
    if (!bindings)
      return;
    attributeBindingsTable.delete(this);
    bindings.removeAll();
    Node.prototype.unbindAll.call(this);
  }


  Element.prototype.bind = bindElement;
  Element.prototype.unbind = unbindElement;
  Element.prototype.unbindAll = unbindAllElement;

  var valueBindingTable = new SideTable('valueBinding');
  var checkedBindingTable = new SideTable('checkedBinding');

  function getEventForInputType(element) {
    switch (element.type) {
      case 'checkbox':
        return 'click';
      case 'radio':
      case 'select-multiple':
      case 'select-one':
        return 'change';
      default:
        return 'input';
    }
  }

  function InputBinding(element, model, path) {
    this.element = element;
    this.boundValueChanged = this.valueChanged.bind(this);
    this.boundUpdateBinding = this.updateBinding.bind(this);

    this.binding = new Binding(model, path, this.boundValueChanged);
    this.element.addEventListener(getEventForInputType(this.element),
                                  this.boundUpdateBinding, true);
  }

  InputBinding.prototype = {
    unbind: function() {
      this.binding.unbind();
      this.element.removeEventListener(getEventForInputType(this.element),
                                        this.boundUpdateBinding, true);
    }
  };

  function ValueBinding(element, model, path) {
    InputBinding.call(this, element, model, path);
  }

  ValueBinding.prototype = createObject({
    __proto__: InputBinding.prototype,

    valueChanged: function(value) {
      this.element.value = String(value == null ? '' : value);
    },

    updateBinding: function() {
      // TODO(arv): https://code.google.com/p/mdv/issues/detail?id=30
      this.binding.value = this.element.value;
      Model.notifyChanges();
    }
  });

  function isNodeInDocument(node) {
    return node.ownerDocument.contains(node);
  }

  var filter = Array.prototype.filter.call.bind(Array.prototype.filter);

  // |element| is assumed to be an HTMLInputElement with |type| == 'radio'.
  // Returns an array containing all radio buttons other than |element| that
  // have the same |name|, either in the form that |element| belongs to or,
  // if no form, in the document tree to which |element| belongs.
  //
  // This implementation is based upon the HTML spec definition of a
  // "radio button group":
  //   http://www.whatwg.org/specs/web-apps/current-work/multipage/number-state.html#radio-button-group
  //
  function getAssociatedRadioButtons(element) {
    if (!isNodeInDocument(element))
      return [];
    if (element.form) {
      return filter(element.form.elements, function(el) {
        return el != element &&
            el.tagName == 'INPUT' &&
            el.type == 'radio' &&
            el.name == element.name;
      });
    } else {
      var radios = element.ownerDocument.querySelectorAll(
          'input[type="radio"][name="' + element.name + '"]');
      return filter(radios, function(el) {
        return el != element && !el.form;
      });
    }
  }

  function CheckedBinding(element, model, path) {
    InputBinding.call(this, element, model, path);
  }

  CheckedBinding.prototype = createObject({
    __proto__: InputBinding.prototype,

    valueChanged: function(newValue) {
      this.element.checked = Boolean(newValue);
    },

    updateBinding: function() {
      var value = this.element.checked;
      this.binding.value = value;

      // Only the radio button that is getting checked gets an event. We
      // therefore find all the associated radio buttons and update their
      // CheckedBinding manually.
      if (this.element.tagName === 'INPUT' &&
          this.element.type === 'radio') {
        getAssociatedRadioButtons(this.element).forEach(function(r) {
          var checkedBinding = checkedBindingTable.get(r);
          if (checkedBinding) {
            // Set the value directly to avoid an infinite call stack.
            checkedBinding.binding.value = false;
          }
        });
      }

      // TODO(arv): https://code.google.com/p/mdv/issues/detail?id=30
      Model.notifyChanges();
    }
  });

  function bindInput(name, model, path) {
    switch(name) {
      case 'value':
        this.unbind('value');
        this.removeAttribute('value');
        valueBindingTable.set(this, new ValueBinding(this, model, path));
        break;
      case 'checked':
        this.unbind('checked');
        this.removeAttribute('checked');
        checkedBindingTable.set(this, new CheckedBinding(this, model, path));
        break;
      default:
        return Element.prototype.bind.call(this, name, model, path);
        break;
    }
  }

  function unbindInput(name) {
    switch(name) {
      case 'value':
        var valueBinding = valueBindingTable.get(this);
        if (valueBinding) {
          valueBinding.unbind();
          valueBindingTable.delete(this);
        }
        break;
      case 'checked':
        var checkedBinding = checkedBindingTable.get(this);
        if (checkedBinding) {
          checkedBinding.unbind();
          checkedBindingTable.delete(this)
        }
        break;
      default:
        return Element.prototype.unbind.call(this, name);
        break;
    }
  }

  function unbindAllInput(name) {
    this.unbind('value');
    this.unbind('checked');
    Element.prototype.unbindAll.call(this);
  }

  HTMLInputElement.prototype.bind = bindInput;
  HTMLInputElement.prototype.unbind = unbindInput;
  HTMLInputElement.prototype.unbindAll = unbindAllInput;

})();
