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

window.testPurchase = async () => {
  try {
    const productId = document.getElementById('productId').value;
    log('buying ' + productId + '…');
    const { result } = await Revnix.purchase({ productId });
    if (!result) {
      log('purchase cancelled');
      return;
    }
    await Revnix.waitForEntitlements({ seq: result.seq });
    const { entitled } = await Revnix.isEntitled({ entitlementId: document.getElementById('entitlementId').value });
    log('purchased ' + productId + ' · event ' + result.eventId + ' · seq ' + result.seq + (entitled ? ' · UNLOCKED' : ' · locked'));
  } catch (err) {
    log('purchase failed [' + (err.code || '?') + ']: ' + err.message);
  }
};

window.testRestore = async () => {
  try {
    const { restored } = await Revnix.restore();
    log('restored ' + restored + ' purchase(s)');
  } catch (err) {
    log('restore failed [' + (err.code || '?') + ']: ' + err.message);
  }
};
