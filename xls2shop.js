var shopifyAPI = require('shopify-node-api');
var XLSX = require('xlsx');
var clc = require('cli-color');
var prompt = require('prompt');
var ProgressBar = require('progress');

var productColumns = {
  'productId': 'A',
  'productTitle': 'B',
  'productType': 'C',
  'visible': 'D',
  'productDescription': 'E',
  'productVendor': 'F',
  'InventoryQuantity': 'G',
  'collectionTags': 'H',
  'otherTags': 'I',
  'defaultPrice': 'J',
  'options': 'K',
  'image': 'L',
};

var optionColumns = {
  'optionId': 'A',
  'optionName': 'B',
  'optionLabel': 'C',
  'selectors': 'D'
};

var variantColumns = {
  'sku': 'A',
  'productTitle': 'B',
  'variant': 'C',
  'price': 'D',
  'tags': 'E',
};



var Shopify = new shopifyAPI({
  shop: '', // MYSHOP.myshopify.com
  shopify_api_key: '', // Your API key
  shopify_shared_secret: '', // Your Shared Secret
  access_token: '', //permanent token
  verbose: false,
  rate_limit_delay: 10000, // 10 seconds (in ms) => if Shopify returns 429 response code
  backoff: 35, // limit X of 40 API calls => default is 35 of 40 API calls
  backoff_delay: 1000, // 1 second (in ms) => wait 1 second if backoff option is exceeded
  retry_errors: true
});


var input = process.argv[2];

switch (input) {
  case 'clean':
    prompt.get(clc.red("Are you sure you want to remove all the products from your store? yes/no: "), function(err, answer) {
      console.log(answer);
      if (answer[Object.keys(answer)[0]] == "yes") {
        Shopify.get('/admin/products.json', function(err, data, headers) {
          data.products.forEach(function(product) {
            Shopify.delete('/admin/products/' + product.id + '.json', function(err, data, headers) {

              errorCheck('removing ' + product.product_type, err, headers);

            })
          })
        })
      }
    })
    break;
  case 'upload':
    uploadProductsToShop(process.argv[3])
    break;
  default:
    console.log('1)upload variants to Shopify => node xls2shop.js ' + clc.green('upload') + ' variantsFile.xlsx\n3)remove all Shopify products => node xls2shop.js ' + clc.green('clean'));
}

function sleep(time, callback) {
  var stop = new Date().getTime();
  while (new Date().getTime() < stop + time) {;
  }
  callback();
}




function uploadProductsToShop(file) {

  var workbook = XLSX.readFile(file);
  var productSheet = workbook.Sheets['products'];
  var optionSheet = workbook.Sheets['options'];
  var variantSheet = workbook.Sheets['variants'];
  var products = getProducts(productSheet);

  products.forEach(function(product) {

    var variants = getVariants(product, variantSheet);
    Promise.all(variants.map(postVariant)).then(function(identifiers) {
      var description = product.product.body_html;
      description += getOptions(product, optionSheet);
      description += '<script>var selectors = ' + JSON.stringify(getSelectors(product, optionSheet)) + ';</script>';
      description += '<script>var variants = ' + JSON.stringify(identifiers) + ';</script>';
      product.product.body_html = description;

      return Promise.all([product].map(postProduct));
    }).then(function(identifiers) {
      // return Promise.all(product.collectionTags.map(postCollection));
    })

  });



}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

var blockEmitter = 0;
var counter = 0;

function errorCheck(message, err, headers) {

  var bar = new ProgressBar(':bar', {
    total: 100,
    width: 40,
  });
  blockEmitter++;
  counter++;
  if (blockEmitter > 5) {
    for (var i = 0; i < 100; i++) {
      sleep(10, function() {
        blockEmitter = 0;
        bar.tick();
      });
    }

  } else {
    var rand = getRandomInt(3, 10);
    for (var i = 0; i < 100; i++) {
      sleep(rand, function() {
        bar.tick();
      });
    }
  }

  if (headers) {
    var api_limit = headers['http_x_shopify_shop_api_call_limit'];
  } else {
    var api_limit = 'error';
  }

  if (!err) {
    console.log(clc.yellow(message) + ' | ' + counter + ' | ' + clc.blue('speed: ' + api_limit) + ' | ' + clc.green(' done'));
    return false;
  } else {
    console.log(clc.red(JSON.stringify(err)));
    return true;
  }
}

function cleanSheet(sheet, columns, r) {
  for (prop in columns) {
    if (!sheet[columns[prop] + r]) {
      sheet[columns[prop] + r] = {
        v: ''
      };
    }
  }
}


function contains(a, obj) {
  var i = a.length;
  while (i--) {
    if (a[i] == obj) {
      return true;
    }
  }
  return false;
}

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}


function getOptions(product, optionSheet) {
  var r = 2;
  var productOptions = '<div class="productOptions">\n';
  var optionsArray = product.options.split(',');
  while (optionSheet[optionColumns['optionId'] + r] &&
    optionSheet[optionColumns['optionId'] + r].v != '') {

    cleanSheet(optionSheet, optionColumns, r);

    if (contains(optionsArray, optionSheet[optionColumns['optionId'] + r].v)) {
      var optionLabel = optionSheet[optionColumns['optionLabel'] + r].v
      var selectorArray = optionSheet[optionColumns['selectors'] + r].v.split(',');

      productOptions += '<br>\n<label>' + optionLabel + '</label>\n<br>\n<select id="' + slugify(optionLabel) + '-selector" style="width:100%;">\n';
      selectorArray.forEach(function(option) {
        productOptions += '<option value = \'' + option + '\' >' + option + '</option>\n';
      });

      productOptions += '</select>\n';
    }

    r++;
  }
  productOptions += '</div>\n';
  return productOptions;
}



function getSelectors(product, optionSheet) {
  var r = 2;
  var selectorArray = [];
  var optionsArray = product.options.split(',');
  while (optionSheet[optionColumns['optionId'] + r] &&
    optionSheet[optionColumns['optionId'] + r].v != '') {

    cleanSheet(optionSheet, optionColumns, r);

    if (contains(optionsArray, optionSheet[optionColumns['optionId'] + r].v)) {
      var optionLabel = optionSheet[optionColumns['optionLabel'] + r].v
      selectorArray.push('#' + slugify(optionLabel) + '-selector');
    }
    r++;
  }
  return selectorArray;
}





function getProducts(productSheet) {
  var r = 2;
  var products = [];
  while (productSheet[productColumns['productId'] + r] &&
    productSheet[productColumns['productId'] + r].v != '' &&
    productSheet[productColumns['options'] + r] &&
    productSheet[productColumns['options'] + r].v != '') {

    cleanSheet(productSheet, productColumns, r);

    product = {
      "collectionTags": productSheet[productColumns['collectionTags'] + r].v.split(','),
      "options": productSheet[productColumns['options'] + r].v,
      "product": {
        // "sku": productSheet[productColumns['productId'] + r].v,
        "title": productSheet[productColumns['productTitle'] + r].v,
        "vendor": productSheet[productColumns['productVendor'] + r].v,
        // "inventory_quantity": productSheet[productColumns['InventoryQuantity'] + r].v,
        "body_html": productSheet[productColumns['productDescription'] + r].v,
        "product_type": 'product',
        "tags": productSheet[productColumns['collectionTags'] + r].v + ',' + productSheet[productColumns['otherTags'] + r].v,
        "published_scope": productSheet[productColumns['visible'] + r].v == 1 ? "global" : "",
        "images": [{
          "src": productSheet[productColumns['image'] + r].v,
          "metafields": [{
            "key": "alt",
            "value": productSheet[productColumns['productTitle'] + r].v,
            "value_type": "string",
            "namespace": "tags"
          }]
        }],
        "variants": [{
          "title": productSheet[productColumns['productTitle'] + r].v,
          "sku": productSheet[productColumns['productId'] + r].v,
          "position": 1,
          "fulfillment_service": "manual",
          "inventory_management": null,
          "price": productSheet[productColumns['defaultPrice'] + r].v,
          // "compare_at_price": null,
          "taxable": true,
          "requires_shipping": true,
        }],
      }
    };
    products.push(product);
    r++
  }
  return products;
}


function getVariants(mainProduct, variantSheet) {
  var r = 2;
  var productVariants = [];
  while (variantSheet[variantColumns['sku'] + r] && variantSheet[variantColumns['sku'] + r].v != '') {

    if (variantSheet[variantColumns['productTitle'] + r].v == mainProduct.product.title) {

      cleanSheet(variantSheet, variantColumns, r);

      productVariants.push({
        "product": {
          "sku": variantSheet[variantColumns['sku'] + r].v,
          "title": mainProduct.product.title,
          "handle": variantSheet[variantColumns['sku'] + r].v,
          "vendor": mainProduct.vendor,
          "body_html": variantSheet[variantColumns['variant'] + r].v,
          // "inventory_quantity": productSheet[productColumns['InventoryQuantity'] + r].v,
          "product_type": 'variant',
          "published_scope": mainProduct.product.published_scope,
          "images": mainProduct.product.images,
          "variants": [{
            "title": variantSheet[variantColumns['variant'] + r].v,
            "sku": variantSheet[variantColumns['sku'] + r].v,
            "position": 1,
            "fulfillment_service": "manual",
            "inventory_management": null,
            "price": variantSheet[variantColumns['price'] + r].v,
            // "compare_at_price": null,
            "taxable": true,
            "requires_shipping": true,
          }],
        }
      })
    }
    r++;
  }
  return productVariants;
}



function postVariant(variant) {
  return new Promise(function(ok, fail) {
    Shopify.post('/admin/products.json', variant, function(err, data, headers) {

      if (!errorCheck('posting variant', err, headers)) {
        ok({
          id: data.product.variants[0].id,
          price: variant.product.variants[0].price,
          variants: variant.product.body_html.split('-')
        });
      };
    });

  });
}


function postProduct(product) {
  return new Promise(function(ok, fail) {
    Shopify.post('/admin/products.json', product, function(err, data, headers) {
      if (!errorCheck('posting product', err, headers)) {
        ok('ok');
      };
    });

  });
}


function postCollection(trackTag) {
  var collection = {
    "smart_collection": {
      "title": trackTag,
      "published": true,
      "rules": [{
        "column": "tag",
        "relation": "equals",
        "condition": trackTag
      }]
    }
  };
  return new Promise(function(ok, fail) {
    Shopify.post('/admin/smart_collections.json', collection, function(err, data, headers) {

      errorCheck('posting collection', err, headers);

      ok(trackTag);
    });
  });

}


/////////////////////////////////////////////////////////////////////////////////////////////////
//you could use shopify description box content has a limited size
/////////////////////////////////////////////////////////////////////////////////////////////////

// LZW-compress a string
function lzw_encode(s) {
  var dict = {};
  var data = (s + "").split("");
  var out = [];
  var currChar;
  var phrase = data[0];
  var code = 256;
  for (var i = 1; i < data.length; i++) {
    currChar = data[i];
    if (dict['_' + phrase + currChar] != null) {
      phrase += currChar;
    } else {
      out.push(phrase.length > 1 ? dict['_' + phrase] : phrase.charCodeAt(0));
      dict['_' + phrase + currChar] = code;
      code++;
      phrase = currChar;
    }
  }
  out.push(phrase.length > 1 ? dict['_' + phrase] : phrase.charCodeAt(0));
  for (var i = 0; i < out.length; i++) {
    out[i] = String.fromCharCode(out[i]);
  }
  return out.join("");
}

// Decompress an LZW-encoded string in the Front end using :
function lzw_decode(s) {
  var dict = {};
  var data = (s + "").split("");
  var currChar = data[0];
  var oldPhrase = currChar;
  var out = [currChar];
  var code = 256;
  var phrase;
  for (var i = 1; i < data.length; i++) {
    var currCode = data[i].charCodeAt(0);
    if (currCode < 256) {
      phrase = data[i];
    } else {
      phrase = dict['_' + currCode] ? dict['_' + currCode] : (oldPhrase + currChar);
    }
    out.push(phrase);
    currChar = phrase.charAt(0);
    dict['_' + code] = oldPhrase + currChar;
    code++;
    oldPhrase = phrase;
  }
  return out.join("");
}

function encode_utf8(s) {
  return unescape(encodeURIComponent(s));
}

function decode_utf8(s) {
  return decodeURIComponent(escape(s));
}
