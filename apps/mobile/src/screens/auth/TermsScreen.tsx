import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeScreen } from '@components/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

export function TermsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <SafeScreen style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.heading}>Terms of Service & Privacy Policy</Text>
        <Text style={styles.updated}>Latest updated: September 2025</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.body}>
          This is HAKA PTE. LTD., the company's product "Haka LIVE" and its subsequent versions ("Haka LIVE", "we" or "our") are incorporated into and bound to these Terms of Service. In these Terms of Service, we shall refer to our products and services as the "Service", unless stated otherwise. Please read on to learn more about our data processing practices. Your use of the Service means that you agree to all the terms stipulated within these Terms of Service. If you do not agree to any of the terms in these Terms of Service, please do not use the Service.
        </Text>

        <Text style={styles.body}>
          We are a company incorporated in INDIA and are compliant with the Personal Data Protection Act 2025. If you have any concerns about the data protection regime in India, we encourage you to visit the website of the India Personal Data Protection Commission.
        </Text>

        <Text style={styles.body}>
          Before using Haka LIVE, you must carefully read and fully understand all the terms stipulated within these Terms of Service, as well as the national laws and regulations on such Internet information services. If you object to any of the terms of these Terms of Service, you may choose not to use Haka LIVE as using it means that you agree to abide by all the provisions of these Terms of Service, and any subsequent amendments we may make to these Terms of Service from time to time. Additionally, you must be at least 18 years old and have full capacity to enter contracts under the laws of the jurisdiction in which you reside. Haka LIVE shall not be held responsible for any events or incidents that occur outside of the platform between its users.
        </Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.body}>
          When you install the Service on your device and register with Haka LIVE, your personal identity information may be collected during the download process of the Service. To register with Haka LIVE, you need to provide your nickname, gender, birthday, location and mobile number (the mobile number is optional), depending on the device used for the Service. When you log in with a third-party account, we may collect other information you provide to us (see "Your user profile").
        </Text>
        <Text style={styles.body}>
          Haka LIVE may also collect non-personally identifiable information, such as certain personal details, including your country of residence and preferences. In addition, Haka LIVE may collect and store information about how you and others use the Service and our website, as well as how you interact with it. This may include SMS data, region, specific data, device usage and connection information, IP address, device functionality, bandwidth, page browsing statistics, network type and the number of interactions with our application.
        </Text>
        <Text style={styles.body}>
          Haka LIVE allows you to share communications containing information in the form of text messages, photos, screenshots, videos and other types of media within Haka LIVE applications with other users. When you decide to share such Communications, you agree that these Communications will be stored on our servers. By choosing to share these Communications, you should be aware that you may lose control over how these Communications are used. We are not responsible for any use or misuse of these Communications you choose to share.
        </Text>
        <Text style={styles.body}>
          In the event of a Haka LIVE crash, freeze, or error, we will collect error report information to investigate the issues and enhance the stability of Haka LIVE. These reports do not contain any personally identifiable information. We will not use this information for any purpose beyond investigating and rectifying errors. Unless otherwise specified, we will not rent or sell your information to any third party without your consent.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use or Disclose the Information Collected</Text>
        <Text style={styles.body}>We will use or, where applicable, disclose your Information for the following purposes:</Text>
        {[
          'Verifying your identity;',
          'Establishing contact with you after Haka LIVE is enabled;',
          'Allowing you to use certain functions of Haka LIVE as provided from time to time;',
          'Displaying the name of the person you communicate with and displaying your name to the person you communicate with in Haka LIVE;',
          'Sending you administrative notifications, alerts and communications related to your use of Haka LIVE;',
          'Providing you with relevant content using the information you allow us to collect;',
          'Operations for internal use, including troubleshooting, data analysis, testing, research, service improvement, error detection and prevention, and addressing fraud or other illegal activities;',
          'Complying with legal obligations to use or disclose such information as required by law, any legal process, any law enforcement agency, or in the interest of national or public security;',
          'Protecting and defending our rights or property, including the enforcement of our Terms of Service;',
          'Sharing your Information with other companies in the Haka LIVE Group, subject to the same terms as specified in these Terms of Service;',
          'Sharing your Information with third-party Service Providers that assist us in providing the Service to you;',
          'Sharing aggregate or anonymous versions of the Information with third parties, including advertisers and investors.',
        ].map((item, i) => (
          <Text key={i} style={styles.bullet}>{'• ' + item}</Text>
        ))}

        <Text style={styles.sectionTitle}>3. User's Own Disclosure of Information or Content</Text>
        <Text style={styles.body}>
          Haka LIVE allows you to choose whether you wish to share your information or content. Any information or content that you voluntarily disclose by publishing it on Haka LIVE becomes accessible to the public. If you choose to share your user information or content, other users may re-share your information or content without your knowledge. We shall not be responsible for such sharing.
        </Text>
        <Text style={styles.body}>
          You may choose to un-share or delete your information or content at any time. However, if information or content is deleted, copies may still be visible in cache and archive pages of the Service, or if other users or third parties have copied or saved the information.
        </Text>

        <Text style={styles.sectionTitle}>4. How to Use the Services and Haka LIVE</Text>
        <Text style={styles.body}>
          Your access to and use of the Services is subject to these terms and all applicable laws and regulations. You agree that you will comply with these Terms of Service and Haka LIVE's Community Guidelines and will not:
        </Text>
        {[
          'Create, upload, transmit, distribute, or store any content that is inaccurate, unlawful, infringing, defamatory, obscene, pornographic, invasive of privacy or publicity rights, harassing, threatening, abusive, inflammatory, or otherwise objectionable;',
          'Impersonate any person or entity, falsely claim an affiliation with any person or entity, or access Haka LIVE accounts of others without permission;',
          'Defame, harass, abuse, threaten or defraud users of Haka LIVE, or collect personal information about users or third parties without their consent;',
          'Remove, circumvent, disable, damage or otherwise interfere with security-related features of the Services;',
          'Reverse engineer, decompile, disassemble or otherwise attempt to discover the source code of the Services;',
          'Interfere with or damage operation of the Services or any user\'s enjoyment of them, by any means, including uploading viruses, adware, spyware, worms, or other malicious code;',
          'Interfere with or disrupt the Services or servers or networks connected to the Services;',
          'Use the Services for any illegal purpose, or in violation of any local, state, national, or international law or regulation;',
          'Providing cash rebates to users in any form is strictly prohibited. Violations will result in immediate termination of the offending account\'s access privileges.',
        ].map((item, i) => (
          <Text key={i} style={styles.bullet}>{'• ' + item}</Text>
        ))}
        <Text style={styles.body}>
          Haka LIVE takes no responsibility and assumes no liability for any User Content or for any loss or damage resulting therefrom. Your use of the Services is at your own risk.
        </Text>

        <Text style={styles.sectionTitle}>5. Child Protection</Text>
        <Text style={styles.body}>
          Haka LIVE prohibits users from creating, uploading, or distributing content that facilitates the exploitation or abuse of children, such as:
        </Text>
        {[
          'Inappropriate interaction targeted at a child (for example, groping or caressing).',
          'Child grooming (for example, befriending a child online to facilitate sexual contact and/or exchanging sexual imagery with that child).',
          'Sexualization of a minor (imagery that depicts, encourages or promotes the sexual abuse of children).',
          'Sextortion (threatening or blackmailing a child by using real or alleged access to a child\'s intimate images).',
          'Trafficking of a child (advertising or solicitation of a child for commercial sexual exploitation).',
        ].map((item, i) => (
          <Text key={i} style={styles.bullet}>{'• ' + item}</Text>
        ))}
        <Text style={styles.body}>
          If child sexual abuse content is identified in user posts, we will take immediate action against the user who posted such content. You can report content related to Child Sexual Abuse and Exploitation (CSAE) behaviour on the platform by using the "HELP" feature in Haka LIVE.
        </Text>

        <Text style={styles.sectionTitle}>6. Your User Profile</Text>
        <Text style={styles.body}>
          The information you enter into your user profile may be shared with your Haka LIVE contacts. You can control the profile settings and access and modify it at any time using the Haka LIVE application. If you use a third-party account (including Google, Facebook, Apple ID) to register on Haka LIVE, we may store the corresponding ID and token on our server. Your personal data can be used by other Haka LIVE users connected to you. You also have the option to "block" any Haka LIVE user in your contact list.
        </Text>

        <Text style={styles.sectionTitle}>7. Data Access and Deletion</Text>
        <Text style={styles.body}>
          You have complete control over the information you choose to share with us. You can manage this by changing the settings in Haka LIVE or your mobile device. You can request that we cease using or delete all your data at any time. However, this action requires the deletion of your Haka LIVE account. If you believe that any data provided to us is inaccurate, you may request data correction by sending a request to{' '}
          <Text style={styles.link}>Haka.public@gmail.com</Text>
        </Text>

        <Text style={styles.sectionTitle}>8. Outbound Links</Text>
        <Text style={styles.body}>
          If you visit a website, product or service provided by a third party, that third party may also collect information about you. These Terms of Service do not apply to any information exchange between you and any third party.
        </Text>

        <Text style={styles.sectionTitle}>9. Safety</Text>
        <Text style={styles.body}>
          Protecting user privacy and personal information is our top priority. By providing us with the Information or using the Service, you agree that all HAKA PTE. LTD. and Haka LIVE employees, contractors, agents and third-party Service Providers are granted access to this Information in order to provide, operate, develop, maintain, support or improve the Service, where necessary. Haka LIVE uses password protection, access logs and system monitoring to protect the confidentiality and security of all member information.
        </Text>
        <Text style={styles.body}>
          However, due to the inherent nature of the Internet and related technologies, we cannot guarantee the protection of the Information from loss, abuse or change. Your Information may be stored and processed in any country where HAKA PTE. LTD. is located.
        </Text>

      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  updated: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  bullet: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
    paddingLeft: spacing.sm,
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  footer: {
    height: spacing.xxl,
  },
});
