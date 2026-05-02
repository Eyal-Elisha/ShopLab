module.exports = {
  slug: 'bopla-admin-preview',
  name: 'BOPLA',
  summary:
    'A catalog response exposes more ownership data than the storefront shows. Somewhere else, that same property is trusted too much.',
  description:
    'Abuse that to create a product that will be inspected by the admin preview flow. Your payload needs to make the new product image URL reach /api/admin/object-property-flag. A successful attempt leaves evidence behind. To check your work, trigger the admin preview api/products/admin-preview. Once youre done check /api/products/leak?productId=<productId>',
  category: 'API3:2023 Broken Object Property Level Authorization',
  difficulty: 'medium',
  flag: 'SHOPLAB{created_by_property_pwns_admin_preview}',
  learningObjectives: [
    'Identify sensitive object properties exposed by API responses',
  ],
  hints: [
    { level: 1, hint: 'What do you see in a raw json reponse when accessing a product?' },
    { level: 2, hint: 'Try sending the creator property back during product creation.' },
    { level: 3, hint: 'The image URL is later handled by a privileged preview flow. Aim it at /api/admin/object-property-flag.' },
  ],
};
