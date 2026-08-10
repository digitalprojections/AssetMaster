package link.created.assetmaster;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {
    private static final String PRODUCT_ID = "assetmaster_ad_free";
    private BillingClient billingClient;
    private final List<ReadyCallback> pendingReadyCallbacks = new ArrayList<>();
    private boolean connecting = false;

    private interface ReadyCallback {
        void onReady();

        void onFailure(BillingResult result);
    }

    @Override
    public void load() {
        super.load();
        billingClient = createBillingClient();
    }

    @PluginMethod
    public void getProduct(PluginCall call) {
        String productId = readProductId(call);
        ensureReady(new ReadyCallback() {
            @Override
            public void onReady() {
                queryProduct(productId, productDetails -> {
                    if (productDetails == null) {
                        JSObject unavailable = new JSObject();
                        unavailable.put("available", false);
                        unavailable.put("productId", productId);
                        call.resolve(unavailable);
                        return;
                    }

                    call.resolve(createProduct(productDetails));
                }, call);
            }

            @Override
            public void onFailure(BillingResult result) {
                rejectWithBillingResult(call, "Play Billing is unavailable.", "billing_unavailable", result);
            }
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = readProductId(call);
        ensureReady(new ReadyCallback() {
            @Override
            public void onReady() {
                queryProduct(productId, productDetails -> {
                    if (productDetails == null) {
                        call.reject("The ad-free product is not available yet.", "product_unavailable");
                        return;
                    }

                    ProductDetails.OneTimePurchaseOfferDetails offer = getBuyOffer(productDetails);
                    if (offer == null) {
                        call.reject("The ad-free product has no active purchase option.", "purchase_option_unavailable");
                        return;
                    }

                    BillingFlowParams.ProductDetailsParams detailsParams =
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(productDetails)
                                    .setOfferToken(offer.getOfferToken())
                                    .build();
                    BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(Collections.singletonList(detailsParams))
                            .build();

                    Activity activity = getActivity();
                    if (activity == null) {
                        call.reject("The Android activity is unavailable.", "activity_unavailable");
                        return;
                    }

                    BillingResult result = billingClient.launchBillingFlow(activity, flowParams);
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        JSObject response = new JSObject();
                        response.put("started", true);
                        call.resolve(response);
                    } else {
                        rejectWithBillingResult(call, "The purchase flow could not be started.", "purchase_start_failed", result);
                    }
                }, call);
            }

            @Override
            public void onFailure(BillingResult result) {
                rejectWithBillingResult(call, "Play Billing is unavailable.", "billing_unavailable", result);
            }
        });
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        String productId = readProductId(call);
        ensureReady(new ReadyCallback() {
            @Override
            public void onReady() {
                QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build();
                billingClient.queryPurchasesAsync(params, (result, purchases) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        rejectWithBillingResult(call, "Purchases could not be restored.", "restore_failed", result);
                        return;
                    }

                    Purchase matchingPurchase = findPurchasedProduct(purchases, productId);
                    if (matchingPurchase == null) {
                        call.resolve(createEntitlement(productId, "none", false, null, false));
                        return;
                    }

                    acknowledgeIfNeeded(matchingPurchase, call, entitlement -> call.resolve(entitlement));
                });
            }

            @Override
            public void onFailure(BillingResult result) {
                rejectWithBillingResult(call, "Play Billing is unavailable.", "billing_unavailable", result);
            }
        });
    }

    private BillingClient createBillingClient() {
        return BillingClient.newBuilder(getContext())
                .setListener(this::onPurchasesUpdated)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    private void ensureReady(ReadyCallback callback) {
        if (billingClient == null) {
            billingClient = createBillingClient();
        }

        if (billingClient.isReady()) {
            callback.onReady();
            return;
        }

        pendingReadyCallbacks.add(callback);
        if (connecting) {
            return;
        }

        connecting = true;
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                connecting = false;
                List<ReadyCallback> callbacks = new ArrayList<>(pendingReadyCallbacks);
                pendingReadyCallbacks.clear();
                for (ReadyCallback pendingCallback : callbacks) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        pendingCallback.onReady();
                    } else {
                        pendingCallback.onFailure(result);
                    }
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                connecting = false;
            }
        });
    }

    private void queryProduct(String productId, ProductCallback callback, PluginCall call) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                rejectWithBillingResult(call, "The ad-free product could not be loaded.", "product_query_failed", result);
                return;
            }

            List<ProductDetails> products = queryResult == null
                    ? Collections.emptyList()
                    : queryResult.getProductDetailsList();
            callback.onProduct(products.isEmpty() ? null : products.get(0));
        });
    }

    private void queryProduct(String productId, ProductCallback callback) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || queryResult == null) {
                callback.onProduct(null);
                return;
            }

            List<ProductDetails> products = queryResult.getProductDetailsList();
            callback.onProduct(products.isEmpty() ? null : products.get(0));
        });
    }

    private interface ProductCallback {
        void onProduct(ProductDetails productDetails);
    }

    private ProductDetails.OneTimePurchaseOfferDetails getBuyOffer(ProductDetails productDetails) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = productDetails.getOneTimePurchaseOfferDetailsList();
        if (offers == null || offers.isEmpty()) {
            return null;
        }

        return offers.stream()
                .filter(offer -> offer.getRentalDetails() == null)
                .findFirst()
                .orElse(offers.get(0));
    }

    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyListeners("purchaseUpdated", createEntitlement(PRODUCT_ID, "canceled", false, null, false));
            return;
        }

        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            JSObject event = createEntitlement(PRODUCT_ID, "error", false, null, false);
            event.put("status", "error");
            event.put("message", result.getDebugMessage());
            notifyListeners("purchaseUpdated", event);
            return;
        }

        for (Purchase purchase : purchases) {
            if (purchase.getProducts().contains(PRODUCT_ID)) {
                processPurchase(purchase);
            }
        }
    }

    private void processPurchase(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            JSObject event = createEntitlement(PRODUCT_ID, "pending", false, purchase.getPurchaseToken(), purchase.isAcknowledged());
            event.put("status", "pending");
            notifyListeners("purchaseUpdated", event);
            return;
        }

        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            return;
        }

        acknowledgeIfNeeded(purchase, null, entitlement -> {
            entitlement.put("status", "purchased");
            notifyListeners("purchaseUpdated", entitlement);
        });
    }

    private void acknowledgeIfNeeded(Purchase purchase, PluginCall call, EntitlementCallback callback) {
        if (purchase.isAcknowledged()) {
            callback.onEntitlement(createEntitlement(PRODUCT_ID, "purchased", true, purchase.getPurchaseToken(), true));
            return;
        }

        com.android.billingclient.api.AcknowledgePurchaseParams params =
                com.android.billingclient.api.AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.getPurchaseToken())
                        .build();
        billingClient.acknowledgePurchase(params, result -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                callback.onEntitlement(createEntitlement(PRODUCT_ID, "purchased", true, purchase.getPurchaseToken(), true));
                return;
            }

            if (call != null) {
                rejectWithBillingResult(call, "The purchase could not be acknowledged.", "acknowledge_failed", result);
            } else {
                JSObject event = createEntitlement(PRODUCT_ID, "error", false, purchase.getPurchaseToken(), false);
                event.put("status", "error");
                event.put("message", result.getDebugMessage());
                notifyListeners("purchaseUpdated", event);
            }
        });
    }

    private Purchase findPurchasedProduct(List<Purchase> purchases, String productId) {
        if (purchases == null) {
            return null;
        }

        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED
                    && purchase.getProducts().contains(productId)) {
                return purchase;
            }
        }

        return null;
    }

    private JSObject createEntitlement(String productId, String purchaseState, boolean hasAdFree, String token, boolean acknowledged) {
        JSObject result = new JSObject();
        result.put("hasAdFree", hasAdFree);
        result.put("productId", productId);
        result.put("purchaseState", purchaseState);
        result.put("acknowledged", acknowledged);
        if (token != null) {
            result.put("purchaseToken", token);
        }
        return result;
    }

    private JSObject createProduct(ProductDetails productDetails) {
        ProductDetails.OneTimePurchaseOfferDetails offer = getBuyOffer(productDetails);
        JSObject result = new JSObject();
        result.put("available", offer != null);
        result.put("productId", productDetails.getProductId());
        result.put("title", productDetails.getTitle());
        result.put("description", productDetails.getDescription());
        result.put("formattedPrice", offer == null ? "" : offer.getFormattedPrice());
        result.put("currencyCode", offer == null ? "" : offer.getPriceCurrencyCode());
        return result;
    }

    private String readProductId(PluginCall call) {
        String productId = call.getString("productId");
        return productId == null || productId.trim().isEmpty() ? PRODUCT_ID : productId.trim();
    }

    private void rejectWithBillingResult(PluginCall call, String message, String code, BillingResult result) {
        call.reject(message, code + "_" + result.getResponseCode() + ":" + result.getDebugMessage());
    }

    private interface EntitlementCallback {
        void onEntitlement(JSObject entitlement);
    }
}
