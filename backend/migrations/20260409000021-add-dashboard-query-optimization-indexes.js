'use strict'

const INDEX_SPECS = [
  {
    name: 'idx_invoices_company_created_at',
    fields: ['company_id', 'created_at'],
  },
  {
    name: 'idx_invoices_company_status',
    fields: ['company_id', 'status'],
  },
  {
    name: 'idx_invoices_company_due_date',
    fields: ['company_id', 'due_date'],
  },
]

function hasMatchingFieldOrder(indexes, targetFields) {
  const targetSignature = targetFields.join('|')

  return indexes.some(index => {
    const signature = (index.fields || [])
      .map(field => field.attribute)
      .filter(Boolean)
      .join('|')

    return signature === targetSignature
  })
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const existingIndexes = await queryInterface.showIndex('invoices')

    for (const spec of INDEX_SPECS) {
      if (!hasMatchingFieldOrder(existingIndexes, spec.fields)) {
        await queryInterface.addIndex('invoices', spec.fields, {
          name: spec.name,
        })
      }
    }
  },

  async down(queryInterface) {
    for (const spec of INDEX_SPECS) {
      try {
        await queryInterface.removeIndex('invoices', spec.name)
      } catch (_error) {
        // Ignore missing index names in rollback for safety.
      }
    }
  },
}
