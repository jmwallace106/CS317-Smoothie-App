<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset = "UTF-8">
    <title>SmoothI</title>
    <link rel="stylesheet" href="smoothI.css">
</head>

<body>
    <header><h1>SmoothI</h1></header>

    <div id = "smoothIGraphics">
        <img src = "tropicalSmoothie.png" alt = "tropicalSmoothie" width="80%">
    </div>

    <h2>Enter Username and Password</h2>

    <form id = "registerForm" action = "makeLater.php" method = "post">
        <p><input type = "text" name = "username" content="Username" value = "Username"></p>
        <p><input type = "password" name = "password" content="Password" value = "Password"></p>
        <button type = "submit">Register</button>
    </form>
</body>
