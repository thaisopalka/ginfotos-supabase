import 'dart:io';

import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class MapLauncherHelper {
  static Future<void> openWaze({required LatLng destination}) async {
    final lat = destination.latitude;
    final lng = destination.longitude;

    final appUri = Uri.parse('waze://?ll=$lat,$lng&navigate=yes');
    final webUri = Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes');

    if (await canLaunchUrl(appUri)) {
      await launchUrl(appUri, mode: LaunchMode.externalApplication);
      return;
    }

    await launchUrl(webUri, mode: LaunchMode.externalApplication);
  }

  static Future<void> openGoogleMaps({required LatLng destination}) async {
    final lat = destination.latitude;
    final lng = destination.longitude;

    final appUri = Platform.isIOS
        ? Uri.parse('comgooglemaps://?daddr=$lat,$lng&directionsmode=driving')
        : Uri.parse('google.navigation:q=$lat,$lng&mode=d');

    final webUri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
    );

    if (await canLaunchUrl(appUri)) {
      await launchUrl(appUri, mode: LaunchMode.externalApplication);
      return;
    }

    await launchUrl(webUri, mode: LaunchMode.externalApplication);
  }
}
