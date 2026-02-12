const xmlrpc = require('xmlrpc');
const fs = require('fs');

const config = {
  url: 'https://duracubeuat.com.au',
  db: '25_04_07',
  username: 'kasun.jayasinghe@duracube.com.au',
  password: '9b8391d2bac4c6c9d9085b112b808a7801a83321'
};

const commonClient = xmlrpc.createSecureClient({
  host: 'duracubeuat.com.au',
  port: 443,
  path: '/xmlrpc/2/common',
  headers: { 'Content-Type': 'text/xml' }
});

commonClient.methodCall('authenticate', [config.db, config.username, config.password, {}], (err, uid) => {
  if (err || uid === false) {
    console.error('Auth failed');
    return;
  }

  console.log('Authenticated. Starting extraction...');

  const objectClient = xmlrpc.createSecureClient({
    host: 'duracubeuat.com.au',
    port: 443,
    path: '/xmlrpc/2/object',
    headers: { 'Content-Type': 'text/xml' }
  });

  // Step 1: Get all models
  console.log('\nStep 1: Fetching all models...');

  objectClient.methodCall('execute_kw', [
    config.db, uid, config.password,
    'ir.model', 'search_read', [[]],
    { fields: ['id', 'model', 'name'], limit: 2000 }
  ], (err, models) => {
    if (err) {
      console.error('Error fetching models:', err.message);
      return;
    }

    console.log('Fetched', models.length, 'models');

    // Create lookup: model_name -> {id, name}
    const modelLookup = {};
    models.forEach(m => {
      modelLookup[m.model] = { id: m.id, name: m.name };
    });

    // Step 2: Get ALL fields to build field lookup
    console.log('\nStep 2: Fetching all fields for lookup...');

    objectClient.methodCall('execute_kw', [
      config.db, uid, config.password,
      'ir.model.fields', 'search_count', [[]]
    ], (err, totalCount) => {
      if (err) {
        console.error('Error:', err.message);
        return;
      }

      console.log('Total fields:', totalCount);

      const batchSize = 1000;
      const batches = Math.ceil(totalCount / batchSize);
      let allFields = [];
      let completed = 0;

      function fetchBatch(offset) {
        objectClient.methodCall('execute_kw', [
          config.db, uid, config.password,
          'ir.model.fields', 'search_read', [[]],
          {
            fields: ['id', 'name', 'field_description', 'model_id', 'model', 'ttype', 'relation', 'relation_field', 'relation_table', 'column1', 'column2', 'store'],
            offset: offset,
            limit: batchSize,
            order: 'model, name'
          }
        ], (err, fields) => {
          if (err) {
            console.error('Error fetching batch:', err.message);
            return;
          }

          allFields = allFields.concat(fields);
          completed++;
          console.log('Batch', completed, '/', batches, '- Total:', allFields.length);

          if (completed < batches) {
            fetchBatch(offset + batchSize);
          } else {
            processFields(allFields, modelLookup);
          }
        });
      }

      function processFields(fields, modelLookup) {
        console.log('\nStep 3: Building field lookup...');

        // Create lookup: "model.field" -> field_id
        const fieldLookup = {};
        fields.forEach(f => {
          const key = f.model + '.' + f.name;
          fieldLookup[key] = f.id;
        });

        console.log('Field lookup built with', Object.keys(fieldLookup).length, 'entries');

        console.log('\nStep 4: Processing and saving...');

        // Create CSV with all columns including Primary Data Model ID and Field ID
        let csv = 'Field_ID,Field_Name,Field_Label,Field_Type,Model_ID,Model_Name,Related_Model,Related_Model_ID,Relation_Field,Relation_Table,Column1,Column2,Primary_Data_Location,Primary_Data_Model_ID,Primary_Data_Field_ID,Stored\n';

        fields.forEach(f => {
          const fieldId = f.id;
          const fieldName = f.name;
          const fieldLabel = (f.field_description || '').replace(/"/g, '""').replace(/,/g, ';');
          const fieldType = f.ttype;

          const modelId = Array.isArray(f.model_id) ? f.model_id[0] : (f.model_id || '');
          const modelName = f.model;

          const relatedModel = f.relation || '';
          let relatedModelId = '';
          if (relatedModel && modelLookup[relatedModel]) {
            relatedModelId = modelLookup[relatedModel].id;
          }

          const relationField = f.relation_field || '';
          const relationTable = f.relation_table || '';
          const column1 = f.column1 || '';
          const column2 = f.column2 || '';

          // Determine primary data location and its model/field IDs
          let primaryDataLocation = '';
          let primaryDataModelId = '';
          let primaryDataFieldId = '';

          if (fieldType === 'many2one') {
            // many2one: references 'id' column in related model
            if (relatedModel) {
              primaryDataLocation = relatedModel + '.id';
              primaryDataModelId = relatedModelId;
              // Get the 'id' field ID from related model
              const idFieldKey = relatedModel + '.id';
              primaryDataFieldId = fieldLookup[idFieldKey] || '';
            }
          } else if (fieldType === 'one2many') {
            // one2many: data stored in related model's relation_field
            if (relatedModel && relationField) {
              primaryDataLocation = relatedModel + '.' + relationField;
              primaryDataModelId = relatedModelId;
              const relFieldKey = relatedModel + '.' + relationField;
              primaryDataFieldId = fieldLookup[relFieldKey] || '';
            }
          } else if (fieldType === 'many2many') {
            // many2many: uses junction table
            if (relationTable) {
              primaryDataLocation = 'Junction: ' + relationTable;
              primaryDataModelId = 'N/A';
              primaryDataFieldId = 'N/A';
            }
          } else if (f.store) {
            // Regular stored field: data in this model's column
            primaryDataLocation = modelName + '.' + fieldName;
            primaryDataModelId = modelId;
            primaryDataFieldId = fieldId;  // Same as this field
          } else {
            primaryDataLocation = 'Computed';
            primaryDataModelId = '';
            primaryDataFieldId = '';
          }

          const stored = f.store ? 'Yes' : 'No';

          csv += fieldId + ',' +
                 fieldName + ',' +
                 '"' + fieldLabel + '",' +
                 fieldType + ',' +
                 modelId + ',' +
                 modelName + ',' +
                 relatedModel + ',' +
                 relatedModelId + ',' +
                 relationField + ',' +
                 relationTable + ',' +
                 column1 + ',' +
                 column2 + ',' +
                 '"' + primaryDataLocation + '",' +
                 primaryDataModelId + ',' +
                 primaryDataFieldId + ',' +
                 stored + '\n';
        });

        fs.writeFileSync('ir_model_fields_complete.csv', csv);

        console.log('\n=== SAVED: ir_model_fields_complete.csv ===\n');
        console.log('Total fields:', fields.length);
        console.log('\nColumns:');
        console.log('  1. Field_ID - ID in ir.model.fields');
        console.log('  2. Field_Name - Technical field name');
        console.log('  3. Field_Label - Human-readable label');
        console.log('  4. Field_Type - Field type');
        console.log('  5. Model_ID - Parent model ID (ir.model)');
        console.log('  6. Model_Name - Parent model name');
        console.log('  7. Related_Model - Referenced model');
        console.log('  8. Related_Model_ID - Referenced model ID');
        console.log('  9. Relation_Field - FK column in related model');
        console.log('  10. Relation_Table - Junction table');
        console.log('  11. Column1 - First FK in junction');
        console.log('  12. Column2 - Second FK in junction');
        console.log('  13. Primary_Data_Location - Where data is stored');
        console.log('  14. Primary_Data_Model_ID - Model ID where data lives (ir.model)');
        console.log('  15. Primary_Data_Field_ID - Field ID where data lives (ir.model.fields)');
        console.log('  16. Stored - Is field stored?');

        // Show some examples
        console.log('\n=== SAMPLE DATA ===\n');

        const samples = fields.filter(f => f.model === 'crm.lead').slice(0, 15);

        console.log('Field_Name | Field_ID | Type | Primary_Data_Location | Primary_Model_ID | Primary_Field_ID');
        console.log('-----------|----------|------|----------------------|------------------|------------------');

        samples.forEach(f => {
          let pdl = '', pmid = '', pfid = '';

          if (f.ttype === 'many2one' && f.relation) {
            pdl = f.relation + '.id';
            pmid = modelLookup[f.relation] ? modelLookup[f.relation].id : '';
            pfid = fieldLookup[f.relation + '.id'] || '';
          } else if (f.ttype === 'one2many' && f.relation && f.relation_field) {
            pdl = f.relation + '.' + f.relation_field;
            pmid = modelLookup[f.relation] ? modelLookup[f.relation].id : '';
            pfid = fieldLookup[f.relation + '.' + f.relation_field] || '';
          } else if (f.ttype === 'many2many' && f.relation_table) {
            pdl = 'Junction: ' + f.relation_table;
            pmid = 'N/A';
            pfid = 'N/A';
          } else if (f.store) {
            pdl = f.model + '.' + f.name;
            pmid = Array.isArray(f.model_id) ? f.model_id[0] : f.model_id;
            pfid = f.id;
          } else {
            pdl = 'Computed';
            pmid = '';
            pfid = '';
          }

          console.log(f.name.padEnd(25) + ' | ' +
                      String(f.id).padEnd(8) + ' | ' +
                      f.ttype.padEnd(10) + ' | ' +
                      pdl.padEnd(30) + ' | ' +
                      String(pmid).padEnd(16) + ' | ' +
                      pfid);
        });
      }

      fetchBatch(0);
    });
  });
});
