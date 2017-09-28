var coreSchemaTypes = [
	'array',
	'boolean',
	'integer',
	'number',
	'null',
	'object',
	'string'
]

function generateElementTitle(octothorpes, elementName, elementType, isRequired, isEnum, example) {
	var text = [ octothorpes ]
	if(elementName) {
		text.push(' `' + elementName + '`')
	}
	if (elementType || isRequired) {
		text.push(' (')
		if (elementType) {
			text.push(elementType)
		}
		if (isEnum) {
			text.push(', enum')
		}
		if (isRequired) {
			text.push(', required')
		}
		text.push(')')
	}
	if (example) {
		text.push(' eg: `' + example + '`')
	}
	return text.join('')
}

function generatePropertyRestrictions(schema) {
	var generate = generateSinglePropertyRestriction(schema)
	return [
		generate('minimum', 'Minimum'),
		generate('maximum', 'Maximum'),
		generate('pattern', 'Regex pattern'),
		generate('minItems', 'Minimum items'),
		generate('uniqueItems', 'Unique items')
	].filter(function(text) {
		return text
	}).join('\n')
}

function generateSinglePropertyRestriction(schema) {
	return function(key, text) {
		if (schema[key]) {
			return '* ' + text + ': `' + schema[key] + '`'
		} else {
			return null
		}
	}
}

function generateSchemaSectionText(octothorpes, name, isRequired, schema, subSchemas) {
	var schemaType = getActualType(schema, subSchemas)

	var text = [
		generateElementTitle(octothorpes, name, schemaType, isRequired, schema.enum, schema.example),
		schema.description
	]

  if ( schemaType === '$ref' ) {
    let target = getRef(schema['$ref'], subSchemas);
    text.push(module.exports(target));
  }

  if (schemaType === 'object') {
		if (schema.properties) {
			text.push('Properties of the `' + name + '` object:')
			generatePropertySection(octothorpes, schema, subSchemas).forEach(function(section) {
				text = text.concat(section)
			})
		}
	} else if (schemaType === 'array') {
		var itemsType = schema.items && schema.items.type

		if (!itemsType && schema.items['$ref']) {
			itemsType = getActualType(schema.items, subSchemas)
		}

		if (itemsType && name) {
			text.push('The object is an array with all elements of the type `' + itemsType + '`.')
		} else if (itemsType) {
			text.push('The schema defines an array with all elements of the type `' + itemsType + '`.')
		} else {
			var validationItems = []

			if (schema.items.allOf) {
				text.push('The elements of the array must match *all* of the following properties:')
				validationItems = schema.items.allOf
			} else if (schema.items.anyOf) {
				text.push('The elements of the array must match *at least one* of the following properties:')
				validationItems = schema.items.anyOf
			} else if (schema.items.oneOf) {
				text.push('The elements of the array must match *exactly one* of the following properties:')
				validationItems = schema.items.oneOf
			} else if (schema.items.not) {
				text.push('The elements of the array must *not* match the following properties:')
				validationItems = schema.items.not
			}

			if (validationItems.length > 0) {
				validationItems.forEach(function(item) {
					text = text.concat(generateSchemaSectionText(octothorpes, undefined, false, item, subSchemas))
				})
			}
		}

		if (itemsType === 'object') {
			text.push('The array object has the following properties:')
			generatePropertySection(octothorpes, schema.items, subSchemas).forEach(function(section) {
				text = text.concat(section)
			})
		}
	} else if (schema.oneOf) {
		text.push('The object must be one of the following types:')
		text.push(schema.oneOf.map(function(oneOf) {
      let target = getRef(oneOf['$ref'], subSchemas);
			return '* ' + `[${target.id || target.title }](${target.filePath.replace('.json', '.md')})`;
		}).join('\n'))
	}

	if (schema.enum) {
		text.push('This element must be one of the following enum values:');
		text.push(schema.enum.map(function(enumItem) {
			return '* `' + enumItem + '`'
		}).join('\n'))
	}

	if (schema.default !== undefined) {
		if (schema.default === null || [ "boolean", "number", "string" ].indexOf(typeof schema.default) !== -1) {
			text.push('Default: `' + JSON.stringify(schema.default) + '`')
		} else {
			text.push('Default:')
			text.push('```\n' + JSON.stringify(schema.default, null, 2) + '\n```')
		}
	}

	var restrictions = generatePropertyRestrictions(schema)

	if (restrictions) {
		text.push('Additional restrictions:')
		text.push(restrictions)
	}

	return text
}

function generatePropertySection(octothorpes, schema, subSchemas) {
	if (schema.properties) {
		return Object.keys(schema.properties).map(function(propertyKey) {
			var propertyIsRequired = schema.required && schema.required.indexOf(propertyKey) >= 0
			return generateSchemaSectionText(octothorpes + '#', propertyKey, propertyIsRequired, schema.properties[propertyKey], subSchemas)
		})
	} else if (schema.oneOf) {
		var oneOfList = schema.oneOf.map(function(innerSchema) {

			return '* `' + getActualType(innerSchema, subSchemas) + '`'
		}).join('\n')
		return ['This property must be one of the following types:', oneOfList]
	} else {
		return []
	}
}

function getActualType(schema, subSchemas) {
	if (schema.type) {
		return schema.type
	} else if (schema['$ref']) {
    return '$ref';
	} else {
		return undefined
	}
}

function getRef(ref, subSchemas) {
  if ( ref.match(/^file:\/\//) ) {
    let filePath = ref.replace(/^file:\/\//, '');
    let target = require(`${process.cwd()}/${filePath}`);
    target.filePath = filePath;
    return target;
  }
  else if ( subSchemas[ref] ){
    return subSchemas[ref];
  }
  return undefined;
}

module.exports = function(schema, options = {}) {
	var subSchemaTypes = Object.keys(schema.definitions || {}).reduce(function(map, subSchemaTypeName) {
    if ( subSchemaTypeName === '$ref' ) {
      let target = getRef(subSchemaTypeName, map);
      map['#/definitions/' + target.id] = target;
    }
    else {
  		map['#/definitions/' + subSchemaTypeName] = subSchemaTypeName
    }
		return map

	}, {})

	var text = []
	var octothorpes = options.startingOctothorpes || ''

  if ( options.cwd ) {
    process.chdir(options.cwd);
  }

	if (schema.title) {
		octothorpes += '#'
		text.push(octothorpes + ' ' + schema.title)
	}

	if (schema.type === 'object') {
		if (schema.description) {
			text.push(schema.description)
		}
		text.push('The schema defines the following properties:')
		generatePropertySection(octothorpes, schema, subSchemaTypes).forEach(function(section) {
			text = text.concat(section)
		})
	} else {
		text = text.concat(generateSchemaSectionText('#' + octothorpes, undefined, false, schema, subSchemaTypes));
	}

	if (schema.definitions) {
		text.push('---')
		text.push('# Sub Schemas')
		text.push('The schema defines the following additional types:')
		Object.keys(schema.definitions).forEach(function(subSchemaTypeName) {
			text.push('## `' + subSchemaTypeName + '` (' + schema.definitions[subSchemaTypeName].type + ')')
			text.push(schema.definitions[subSchemaTypeName].description)
			if (schema.definitions[subSchemaTypeName].type === 'object') {
				if (schema.definitions[subSchemaTypeName].properties) {
					text.push('Properties of the `' + subSchemaTypeName + '` object:')
				}
			}
			generatePropertySection('##', schema.definitions[subSchemaTypeName], subSchemaTypes).forEach(function(section) {
				text = text.concat(section)
			})
		})
	}

	return text.filter(function(line) {
		return !!line
	}).join('\n\n')
}
