<?php
// For simplicity, using session or file storage instead of a database

session_start();

// Initialize stock if not set
if (!isset($_SESSION['stock'])) {
    $_SESSION['stock'] = [
        'Shop A' => ['Apples' => 10, 'Bananas' => 5, 'Oranges' => 8],
        'Shop B' => ['Apples' => 3, 'Bananas' => 12, 'Oranges' => 4],
        'Shop C' => ['Apples' => 0, 'Bananas' => 2, 'Oranges' => 6],
    ];
}

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'];
    $shopName = $_POST['shop'];
    $item = $_POST['item'];
    $qty = intval($_POST['quantity']);

    if ($action === 'purchase') {
        // Deduct stock
        if (isset($_SESSION['stock'][$shopName][$item]) && $_SESSION['stock'][$shopName][$item] >= $qty) {
            $_SESSION['stock'][$shopName][$item] -= $qty;
            echo json_encode(['status' => 'success', 'message' => 'Purchase completed.']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Not enough stock.']);
        }
        exit;
    }
}

// Return current stock data
echo json_encode($_SESSION['stock']);
?>
