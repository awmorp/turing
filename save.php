<?php
// Simple proxy to save data to Github as a gist under a user account
// Part of the Turing machine simulator at http://morphett.info/turing/

// Github username. Replace with real username.
$username = "XXX";

// This is the Github OAuth token allowing access to the user's gists. Replace with real token.
$token = "XXX";

header("Content-Type: application/json; charset=utf-8");

// For testing purposes while testing from localhost. Remove Access-Control-* headers when going live.
//header("Access-Control-Allow-Origin: *");
//header("Access-Control-Allow-Headers: Content-Type");

// Construct Github API request JSON object
$input = $HTTP_RAW_POST_DATA;

$machineJSON = new stdClass();
$machineJSON->content = $input;
$files = array(
         "machine.json" => $machineJSON,
    );
$githubRequest = new stdClass();
$githubRequest->description = 'Saved Turing machine state from http://morphett.info/turing/turing.html';
$githubRequest->public = false;
$githubRequest->files = $files;

// Forward request to Github using CURL
$curlHandle = curl_init( "https://api.github.com/gists");  // Create CURL handle
curl_setopt($curlHandle, CURLOPT_POST, 1);  // Specify POST verb
curl_setopt($curlHandle, CURLOPT_HTTPHEADER, array(
        'Content-Type: application/json; charset=utf-8', // Specify json data type. Must include this as CURLOPT_POST sets a default content type.
        'User-Agent: ' . $_SERVER['HTTP_USER_AGENT'],    // Github requires a user agent
        'Authorization: Basic ' . base64_encode($username . ":" . $token),  // Github authorisation credentials
    ));
curl_setopt($curlHandle, CURLOPT_POSTFIELDS, json_encode($githubRequest)); // Set POST data body
curl_setopt($curlHandle, CURLOPT_RETURNTRANSFER, 1); // Tell CURL to return response as result of curl_exec
$curlresult = curl_exec($curlHandle);  // Execute the request
curl_close($curlHandle);

echo( $curlresult );
?>
