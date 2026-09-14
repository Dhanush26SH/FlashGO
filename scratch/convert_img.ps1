Add-Type -AssemblyName System.Drawing
$src = "c:\Users\dhanu\FlashGO\mobile-customer\assets\product-placeholder.png"
$tmp = "c:\Users\dhanu\FlashGO\mobile-customer\assets\product-placeholder-fixed.png"
$img = [System.Drawing.Image]::FromFile($src)
$img.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Remove-Item $src
Move-Item $tmp $src
Write-Output "Image converted to true PNG successfully"
