<?php
/**
 * Get detailed information about a specific Formidable Form including all fields
 * 
 * Variables (injected by template):
 *   $form_id - The form ID or key to retrieve
 * 
 * Returns: JSON object with form details and fields array
 */

if (!class_exists('FrmForm') || !class_exists('FrmField')) {
    echo json_encode(['error' => 'Formidable Forms plugin is not active']);
    exit;
}

// Try to get form by ID or key
if (is_numeric($form_id)) {
    $form = FrmForm::getOne($form_id);
} else {
    $form = FrmForm::getOne($form_id);
}

if (!$form) {
    echo json_encode(['error' => 'Form not found: ' . $form_id]);
    exit;
}

// Get all fields for this form
$fields = FrmField::get_all_for_form($form->id, '', 'include', 'include');

$field_data = array();
foreach ($fields as $field) {
    $options = null;
    if (!empty($field->options) && is_array($field->options)) {
        $options = array();
        foreach ($field->options as $opt) {
            if (is_array($opt)) {
                $options[] = array(
                    'label' => isset($opt['label']) ? $opt['label'] : '',
                    'value' => isset($opt['value']) ? $opt['value'] : ''
                );
            } else {
                $options[] = array('label' => $opt, 'value' => $opt);
            }
        }
    }
    
    $field_data[] = array(
        'id' => $field->id,
        'field_key' => $field->field_key,
        'name' => $field->name,
        'description' => $field->description,
        'type' => $field->type,
        'required' => (bool) $field->required,
        'default_value' => $field->default_value,
        'options' => $options,
        'field_order' => (int) $field->field_order
    );
}

$result = array(
    'id' => $form->id,
    'form_key' => $form->form_key,
    'name' => $form->name,
    'description' => $form->description,
    'status' => $form->status,
    'created_at' => $form->created_at,
    'fields' => $field_data
);

echo json_encode($result);
