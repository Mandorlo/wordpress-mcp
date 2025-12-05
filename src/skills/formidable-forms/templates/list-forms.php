<?php
/**
 * List all Formidable Forms on a WordPress site
 * 
 * Returns: JSON array of forms with id, form_key, name, description, status, created_at
 */

if (!class_exists('FrmForm')) {
    echo json_encode(['error' => 'Formidable Forms plugin is not active']);
    exit;
}

$forms = FrmForm::getAll(
    array('is_template' => 0, 'status' => array('', 'published')),
    'name ASC'
);

$result = array();
foreach ($forms as $form) {
    $result[] = array(
        'id' => $form->id,
        'form_key' => $form->form_key,
        'name' => $form->name,
        'description' => $form->description,
        'status' => $form->status,
        'created_at' => $form->created_at
    );
}

echo json_encode($result);
