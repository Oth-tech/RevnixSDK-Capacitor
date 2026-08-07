import { Revnix } from 'revnix-capacitor';

window.testEcho = () => {
    const inputValue = document.getElementById("echoInput").value;
    Revnix.echo({ value: inputValue })
}
