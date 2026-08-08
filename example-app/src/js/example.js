import { Revnix } from 'revnix-capacitor';

const log = (text) => {
  document.getElementById('output').textContent = text;
};

window.testConfigure = async () => {
  try {
    await Revnix.configure({
      apiKey: document.getElementById('apiKey').value,
      baseUrl: document.getElementById('baseUrl').value,
    });
    const { customerId } = await Revnix.getCustomerId();
    log('configured — customer ' + customerId);
  } catch (err) {
    log('configure failed: ' + err.message);
  }
};

window.testEntitlement = async () => {
  try {
    const id = document.getElementById('entitlementId').value;
    const { entitled } = await Revnix.isEntitled({ entitlementId: id });
    const snapshot = await Revnix.getEntitlements();
    log(
      id + ': ' + (entitled ? 'UNLOCKED' : 'locked') +
      ' · cursor ' + snapshot.cursor +
      (snapshot.stale ? ' · (stale cache)' : ' · live'),
    );
  } catch (err) {
    log('entitlements failed [' + (err.code || '?') + ']: ' + err.message);
  }
};

window.testPlacement = async () => {
  try {
    const key = document.getElementById('placementKey').value;
    const placement = await Revnix.resolvePlacement({ placementKey: key });
    await Revnix.logPaywallShown({ placementKey: key });
    log(
      'offering ' + placement.offering.offeringId + ' · ' +
      placement.offering.packages.length + ' packages · rev ' + placement.revision,
    );
  } catch (err) {
    log('placement failed [' + (err.code || '?') + ']: ' + err.message);
  }
};
