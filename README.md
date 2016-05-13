# Unlimited product variants in Shopify (hack)

The idea of the script is to overcome the variant limitation for Shopify Products.
Shopify has a product variant limitation of 300 per product, whereas products themselves are unlimited.
To get around this limitation this script creates a unique Shopify product for every variant and links the SKU's dynamically to option selectors in the product pages.
The script generates HTML for option boxes and javascript combination arrays. This content is then stored in the description body of the products using the Shopify-node API.
I had to simulate randomly timed API posts since somehow I was getting errors on API POST bursts. (I'll revise the code after some more experiments)
The script creates two types of products in Shopify: 'variants' and 'products'. This allows you to set custom search filters in the admin and keep the variants separate from the actual products.
One product can now have unlimited 'variants' (which are actually Shopify products). They are linked in the variant array that is injected in the product descriptions:

```
var variants = [{"id":13737525511,"price":232.5,"variants":["8.5\" x 11\" "," 100 "," single sided"]},{"id":1232 ...
```
# How to get going:

### 1. Prepare the Excel file

1. Add product rows in the products tab
2. Add the urls to the product images (Shopify will download the images from the urls and add them to your products)
3. Add product options in the options tab
4. Add the option identifiers in the option column on the product page
5. Generate all product variants using the VBA script in the variants page.
6. When adding new products/options, new variants appear in yellow
7. Add correct pricing to the variants

### 2. Edit the xls2shop script

#### 1. Add your Shopify credentials

```
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
```
#### 2. Actions:

Removing all products:

```javascript
node xls2shop.js clean
```

Uploading product variants from Excel:

```javascript
node xls2shop.js upload business\ cards\ example.xlsm
```

### 3. Add the following javascipt to the product pages in Shopify:

```javascript


  var variant = findVariant();
  $( "#price" ).html(parseFloat(variant.price * $('#Quantity').val()).toFixed(2) );


  selectors.forEach(function(selectorId){
    $(selectorId).change(function(){
      variant = findVariant();
      $( "#price" ).html(parseFloat( variant.price * $('#Quantity').val()).toFixed(2)  );
    });
  })


  $('#Quantity').change(function(){
        variant = findVariant();
    $( "#price" ).html(parseFloat(variant.price * $('#Quantity').val()).toFixed(2) );
  });

  function addToCart(){
    console.log(variant);
    $.post('/cart/add.js', {
      quantity: $('#Quantity').val(),
      id: variant.id,
      properties: {}
    }).always(function(){
      $.get('/cart.js').always(function(cartData){
        console.log(JSON.parse(cartData.responseText));
        $('#cartItems').text(JSON.parse(cartData.responseText).item_count);
      });
    })
  }

  function findVariant(){
    dance:
    for (var j = 0; j < variants.length; j++) {
      for (var i = 0; i < variants[j].variants.length; i++) {
        if (variants[j].variants[i].replace(/\s/g, '') != $(selectors[i]).val().replace(/\s/g, '')) {
          continue dance;
        }
      }
      return variants[j];
    }
  }

```

This will take care of passing the SKU of the product variant that was selected to the cart.
The product description that contains the variant data is injected in the product page. It contains a selector array and a variants array. The variants array contains all the possible combinations of the selectors with the corresponding product-variant SKU.

The script can be triggered as such:
```
<button type="button" onclick="addToCart()">
 Add to Cart
</button>

```

Dynamic pricing upon selection change is done by setting an element id to ```price```:

```
$<span id="price"></span>
```

### 4. Finally, hide the option selectors in the collection pages

```
.productOptions{
  display:none;
}
```
